// Unused-deadkey prune (shared by the scaffolder and the carve pipeline): a deadkey that is emitted by some rule but consumed by
// nothing in the carved result (no author rule context, no store item, no
// opaque fragment) is impotent. Its `dk()` outputs only arm a state nothing
// reads, so they are stripped from every output; a rule left with no output
// is removed (pass-through: the key reaches the base keyboard) or rewritten to
// `> nul` (swallow), reusing the suppression compiler's ownership stamp.
//
// KMN has no deadkey declaration: a deadkey exists only through its
// references (rule outputs/contexts and store items), so stripping the output
// references IS removing its definition. This includes deadkeys that were
// already unconsumed in the start keyboard. Iterated to a fixed point, since
// removing a rule can orphan another deadkey.
//
// Fails closed: a deadkey named inside an opaque RawKmnFragment counts as
// consumed, and a fragment mentioning `dk(`/`deadkey(` with a token this
// module cannot read disables pruning entirely.
//
// Not covered: touch-layout `dk` keys are not rewritten (a touch key naming a
// pruned deadkey is left as authored).

import type { IRRule, KeyboardIR, OutputElement } from "@keyboard-studio/contracts";
import { deadkeyNameKey } from "@keyboard-studio/contracts";

export interface PruneDeadkeysResult {
  ir: KeyboardIR;
  notices: string[];
}

export interface PruneDeadkeysOptions {
  /** Only prune these deadkeys (identity keys from {@link consumedDeadkeyKeys}); default every dead deadkey. */
  onlyKeys?: ReadonlySet<string>;
  /** What to do with a rule whose output the prune emptied: a replacement rule, or null to remove it. */
  onEmptied: (rule: IRRule) => IRRule | null;
}

const keyOf = (el: { kind: string; id?: number; name?: string }): string | undefined =>
  el.kind === "deadkey"
    ? `d:${el.id}`
    : el.kind === "namedDeadkey"
      ? `n:${deadkeyNameKey(el.name ?? "")}`
      : undefined;

const labelOf = (key: string): string => `dk(${key.slice(2)})`;

/**
 * Deadkeys read by an author rule's context, held in a store item, or named in
 * an opaque fragment (conservatively "consumed"). Rules owned by the
 * suppression compiler (guards, block rewrites) are not consumers: they exist
 * only to swallow a carved combination, and FR-020's derived arming rewrite
 * likewise treats a carved consumer as gone. `unknown` is true when an opaque
 * fragment mentions a deadkey this module cannot resolve.
 */
export function consumedDeadkeyKeys(ir: KeyboardIR): { keys: Set<string>; unknown: boolean } {
  const out = new Set<string>();
  let unknown = false;
  for (const g of ir.groups) {
    for (const r of g.rules) {
      if (r.ownedByBehaviour !== undefined) continue;
      for (const el of r.context) {
        const k = keyOf(el);
        if (k !== undefined) out.add(k);
      }
    }
  }
  for (const s of ir.stores) {
    for (const it of s.items) {
      const k = keyOf(it);
      if (k !== undefined) out.add(k);
    }
  }
  for (const frag of ir.raw) {
    for (const m of frag.sourceText.matchAll(/\b(dk|deadkey)\s*\(([^)]*)\)/gi)) {
      const tok = (m[2] ?? "").trim();
      const isDk = (m[1] ?? "").toLowerCase() === "dk";
      if (/^[0-9a-f]+$/i.test(tok) && isDk) out.add(`d:${parseInt(tok, 16)}`);
      else if (/^[0-9]+$/.test(tok)) out.add(`d:${parseInt(tok, isDk ? 16 : 10)}`);
      else if (isDk && tok !== "") out.add(`n:${deadkeyNameKey(tok)}`);
      else unknown = true;
    }
  }
  return { keys: out, unknown };
}

export function pruneUnusedDeadkeys(
  carvedIr: KeyboardIR,
  opts: PruneDeadkeysOptions,
): PruneDeadkeysResult {
  const notices: string[] = [];
  let ir = carvedIr;
  const pruned = new Set<string>();
  const strippedRules: string[] = [];
  const removedRules: string[] = [];
  const nulRules: string[] = [];

  for (;;) {
    const { keys: consumed, unknown } = consumedDeadkeyKeys(ir);
    if (unknown) break;
    const dead = new Set<string>();
    for (const g of ir.groups) {
      for (const r of g.rules) {
        for (const el of r.output) {
          const k = keyOf(el);
          if (k !== undefined && !consumed.has(k) && (opts.onlyKeys === undefined || opts.onlyKeys.has(k))) dead.add(k);
        }
      }
    }
    if (dead.size === 0) break;
    for (const k of dead) pruned.add(k);

    ir = {
      ...ir,
      groups: ir.groups.map((g) => {
        let changed = false;
        const rules: IRRule[] = [];
        if (g.readonly) return g;
        for (const r of g.rules) {
          // A suppression-owned rule keyed on a pruned deadkey (a guard such as
          // `dk(3) 'x' > context`) can never fire once nothing arms it.
          if (
            r.ownedByBehaviour !== undefined &&
            r.context.some((el) => {
              const k = keyOf(el);
              return k !== undefined && dead.has(k);
            })
          ) {
            changed = true;
            removedRules.push(r.nodeId);
            continue;
          }
          const kept: OutputElement[] = r.output.filter((el) => {
            const k = keyOf(el);
            return k === undefined || !dead.has(k);
          });
          if (kept.length === r.output.length) {
            rules.push(r);
            continue;
          }
          changed = true;
          if (kept.length > 0) {
            strippedRules.push(r.nodeId);
            rules.push({ ...r, output: kept });
          } else {
            const replacement = opts.onEmptied(r);
            if (replacement === null) removedRules.push(r.nodeId);
            else {
              nulRules.push(r.nodeId);
              rules.push(replacement);
            }
          }
        }
        return changed ? { ...g, rules } : g;
      }),
    };
  }

  if (pruned.size > 0) {
    const parts = [
      strippedRules.length > 0 ? `stripped dk() from the output of ${strippedRules.join(", ")}` : "",
      removedRules.length > 0 ? `removed rule(s) ${removedRules.join(", ")}` : "",
      nulRules.length > 0 ? `rewrote ${nulRules.join(", ")} to nul` : "",
    ].filter((x) => x !== "");
    notices.push(
      `[deadkey] pruned unused deadkey(s) ${[...pruned].sort().map(labelOf).join(", ")}: ${parts.join("; ")}`,
    );
  }
  return { ir, notices };
}

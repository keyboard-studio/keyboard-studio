/**
 * deadkey-lifecycle — cluster shape matchers (internal).
 *
 * A deadkey *entity* is a cluster of rules + stores reconstructed by shape,
 * mirroring the matchers in `@keyboard-studio/contracts`' `ir/deadkeys.ts`
 * (those are module-private there; the shapes are duplicated here rather
 * than re-exported, and the two are pinned together by the round-trip tests
 * in `deadkey-lifecycle.test.ts`: every cluster this module emits must be
 * recognized by the contracts `listDeadkeys`).
 *
 * Canonical cluster (what `deadkey-single-tap.yaml` emits):
 * - trigger: `+ [K] > dk(id)` — single vkey (or char-literal) context,
 *   output exactly `[dk(id)]`.
 * - fan-out: `dk(id) + any(bases) > index(output, N)` — the deadkey state
 *   plus a base letter maps to the parallel output store. Offset is not
 *   constrained (corpus uses 2 and 3).
 * - escape: `dk(id) + [K] > 'accent'` — double-tap emits the accent char.
 *
 * Rules that mention `dk(id)` but match none of these shapes are NOT part
 * of the entity — they are external referrers (delete refuses; rename
 * rewrites their id reference anyway since rename repoints rather than
 * removes).
 */

import { isPlusSeparator } from "@keyboard-studio/contracts";
import type {
  ContextElement,
  IRGroup,
  IRRule,
  KeyboardIR,
  OutputElement,
} from "@keyboard-studio/contracts";

/** A rule located inside its group (for removal / in-place rewrite). */
export interface LocatedRule {
  group: IRGroup;
  rule: IRRule;
}

/** Context/output elements with the codec's synthetic `+` separators removed. */
function withoutPlus<T extends { kind: string; text?: string }>(
  els: readonly T[],
): T[] {
  return els.filter((el) => !isPlusSeparator(el));
}

/** The single context element when the rule has exactly one (post-filter). */
function singleContextElement(
  rule: IRRule,
): ContextElement | null {
  const ctx = withoutPlus(rule.context);
  return ctx.length === 1 ? (ctx[0] ?? null) : null;
}

function isDeadkeyOutput(el: OutputElement | undefined, id: number): boolean {
  return el?.kind === "deadkey" && el.id === id;
}

/**
 * Trigger rule for `id`: `+ [K] > dk(id)` — single vkey (modifiers allowed)
 * or char-literal context, output exactly `[dk(id)]`.
 */
export function matchTriggerRule(rule: IRRule, id: number): boolean {
  if (rule.output.length !== 1 || !isDeadkeyOutput(rule.output[0], id)) {
    return false;
  }
  const c = singleContextElement(rule);
  return c?.kind === "vkey" || c?.kind === "char";
}

/**
 * Fan-out rule for `id`: `dk(id) + any(bases) > index(output, N)`.
 * Returns the referenced store names.
 */
export function matchFanoutRule(
  rule: IRRule,
  id: number,
): { baseStore: string; outputStore: string } | null {
  const ctx = withoutPlus(rule.context);
  if (ctx.length !== 2) return null;
  const d = ctx[0] as ContextElement | undefined;
  const a = ctx[1] as ContextElement | undefined;
  if (d?.kind !== "deadkey" || d.id !== id) return null;
  if (a?.kind !== "any") return null;
  if (rule.output.length !== 1) return null;
  const o = rule.output[0] as OutputElement | undefined;
  if (o?.kind !== "index") return null;
  return { baseStore: a.storeRef, outputStore: o.storeRef };
}

/**
 * Escape rule for `id`: `dk(id) + [K] > 'accent'` — the deadkey state plus a
 * single key yields one character (double-tap escape in the canonical
 * cluster, but any single-key single-char rule consuming the deadkey state
 * is entity-shaped: it is unambiguously part of this deadkey's behaviour).
 * The key is NOT required to equal the trigger key — retarget moves only the
 * trigger rule, so a stale escape key stays entity-owned rather than
 * becoming a delete-blocking referrer.
 */
export function matchEscapeRule(rule: IRRule, id: number): boolean {
  const ctx = withoutPlus(rule.context);
  if (ctx.length !== 2) return false;
  const d = ctx[0] as ContextElement | undefined;
  const k = ctx[1] as ContextElement | undefined;
  if (d?.kind !== "deadkey" || d.id !== id) return false;
  if (k?.kind !== "vkey" && k?.kind !== "char") return false;
  return (
    rule.output.length === 1 && rule.output[0]?.kind === "char"
  );
}

/** True when the rule is any canonical member of `id`'s entity cluster. */
export function isEntityRule(rule: IRRule, id: number): boolean {
  return (
    matchTriggerRule(rule, id) ||
    matchFanoutRule(rule, id) !== null ||
    matchEscapeRule(rule, id)
  );
}

/** Every rule with `dk(id)` in its output, located in its group. */
export function findOutputRules(ir: KeyboardIR, id: number): LocatedRule[] {
  const out: LocatedRule[] = [];
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      if (rule.output.some((el) => el.kind === "deadkey" && el.id === id)) {
        out.push({ group, rule });
      }
    }
  }
  return out;
}

/** Every rule with `dk(id)` in its context, located in its group. */
export function findContextRules(ir: KeyboardIR, id: number): LocatedRule[] {
  const out: LocatedRule[] = [];
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      if (rule.context.some((el) => el.kind === "deadkey" && el.id === id)) {
        out.push({ group, rule });
      }
    }
  }
  return out;
}

/** Trigger rules for `id` (output exactly `[dk(id)]`, single-key context). */
export function findTriggerRules(ir: KeyboardIR, id: number): LocatedRule[] {
  return findOutputRules(ir, id).filter(({ rule }) =>
    matchTriggerRule(rule, id),
  );
}

/**
 * Context rules for `id` that are canonical members of the deadkey's entity:
 * fan-out (`dk(id) + any > index`) or escape (`dk(id) + [key] > char`).
 * Rules mentioning `dk(id)` in context that match neither shape are NOT part
 * of the entity — they are external referrers (delete refuses; rename
 * repoints them).
 */
export function findEntityContextRules(
  ir: KeyboardIR,
  id: number,
): LocatedRule[] {
  return findContextRules(ir, id).filter(
    ({ rule }) =>
      matchFanoutRule(rule, id) !== null || matchEscapeRule(rule, id),
  );
}

/** Fan-out rules for `id`, with their located rules and store names. */
export function findFanoutRules(
  ir: KeyboardIR,
  id: number,
): Array<LocatedRule & { baseStore: string; outputStore: string }> {
  const out: Array<LocatedRule & { baseStore: string; outputStore: string }> =
    [];
  for (const { group, rule } of findContextRules(ir, id)) {
    const m = matchFanoutRule(rule, id);
    if (m !== null) out.push({ group, rule, ...m });
  }
  return out;
}

/**
 * All store names a rule references: `any`/`notany`/`index` in context,
 * `index`/`outs` in output.
 */
export function storeRefsOfRule(rule: IRRule): string[] {
  const refs: string[] = [];
  for (const el of rule.context) {
    if (el.kind === "any" || el.kind === "notany" || el.kind === "index") {
      refs.push(el.storeRef);
    }
  }
  for (const el of rule.output) {
    if (el.kind === "index" || el.kind === "outs") {
      refs.push(el.storeRef);
    }
  }
  return refs;
}

/**
 * Human-readable referrer description for `"referenced"` conflicts, e.g.
 * `group "main" rule "r#7" — dk(3001) in context`.
 */
export function describeRule(group: IRGroup, rule: IRRule, id: number): string {
  const hex = id.toString(16).padStart(4, "0");
  const inOutput = rule.output.some(
    (el) => el.kind === "deadkey" && el.id === id,
  );
  const inContext = rule.context.some(
    (el) => el.kind === "deadkey" && el.id === id,
  );
  const where = [
    inContext ? "context" : null,
    inOutput ? "output" : null,
  ]
    .filter(Boolean)
    .join(" and ");
  return `group "${group.name}" rule "${rule.nodeId}" — dk(${hex}) in ${where}`;
}

/** The trigger key of a trigger rule (vkey name or literal char). */
export function triggerKeyOf(rule: IRRule): string | null {
  const c = singleContextElement(rule);
  if (c?.kind === "vkey") return c.name;
  if (c?.kind === "char") return c.value;
  return null;
}

// Expands the keyboard-wide fallback policy into the per-combination
// dispositions the carve-suppression compiler consumes (FR-020..FR-022), and
// resolves a position's swallow-or-pass value from the characters the picked
// base keyboards type there (spec 109 FR-010, FR-015).
//
// Only the SOURCE of the decision moved (per-combo records -> one policy);
// `compileCarveSuppression` is unchanged, including its deadkey backstop:
// it coerces `allow-host` on a deadkey-context rule back to `block`, so a
// `pass-through` policy can never leave a deadkey armed.

import type {
  CarveDisposition,
  Disposition,
  FallbackPolicy,
  IRRule,
  KeyboardIR,
  LeakClass,
} from "@keyboard-studio/contracts";
import { canonicalizeCombo, type ModifierToken } from "./modifierCombos.js";
import { parseSlotId } from "./slotId.js";
import { bindingsOfRule, bindingsOfStoreItem } from "./unhandledPositions.js";

/** What a base keyboard types at one position. */
export type LeakOutcome =
  | { kind: "char"; char: string; leakClass: LeakClass }
  | { kind: "deadkey" }
  | { kind: "unknown" };

/**
 * One unhandled position paired with what one base keyboard types there.
 * The caller joins this in from base-keyboard data; the engine never reads
 * the studio (FR-041).
 */
export interface Leak {
  position: { key: string; modifiers: string };
  baseKeyboard: string;
  outcome: LeakOutcome;
}

/** The three classes, in the order a policy and its proposals list them. */
export const LEAK_CLASSES: readonly LeakClass[] = ["letters", "digits", "punctuation"];

/** True when at least one class is set to "Do nothing". */
export function anyClassSwallows(policy: FallbackPolicy): boolean {
  return LEAK_CLASSES.some((c) => policy[c] === "swallow");
}

/**
 * Is a position swallowed, given everything the picked base keyboards type there?
 *
 * "Any picked base keyboard" rule (FR-010): swallowed when some typed
 * character falls in a class set to "Do nothing". A deadkey, an unknown cell,
 * or no data at all cannot be classed, so those follow the most cautious
 * reading: swallowed when any class is "Do nothing" (the bias the skip-set
 * has always had), left alone when every class passes through (FR-014).
 */
export function isSwallowedByPolicy(
  policy: FallbackPolicy,
  outcomes: readonly LeakOutcome[],
): boolean {
  let unclassed = outcomes.length === 0;
  for (const o of outcomes) {
    if (o.kind === "char") {
      if (policy[o.leakClass] === "swallow") return true;
    } else {
      unclassed = true;
    }
  }
  return unclassed && anyClassSwallows(policy);
}

/** Stable identity of a position: the key plus its canonical modifier set. */
export function positionId(key: string, modifiers: string): string {
  const tokens = modifiers.split(/\s+/).filter((t) => t.length > 0) as ModifierToken[];
  let canon: string[];
  try {
    canon = canonicalizeCombo(tokens);
  } catch {
    canon = tokens;
  }
  return `${canon.join(" ")}|${key.toUpperCase()}`;
}

/** Group leak outcomes by position, for join-by-position lookups. */
export function outcomesByPosition(leaks: readonly Leak[]): Map<string, LeakOutcome[]> {
  const out = new Map<string, LeakOutcome[]>();
  for (const leak of leaks) {
    const id = positionId(leak.position.key, leak.position.modifiers);
    const list = out.get(id);
    if (list) list.push(leak.outcome);
    else out.set(id, [leak.outcome]);
  }
  return out;
}

function ruleById(ir: KeyboardIR, id: string): IRRule | undefined {
  for (const group of ir.groups) {
    for (const rule of group.rules) if (rule.nodeId === id) return rule;
  }
  return undefined;
}

/**
 * The positions a carved combination occupies, addressed the way the carve
 * pipeline addresses it (a rule nodeId, or `<storeNodeId>#<index>`).
 *
 * A rule occupies the positions it binds. A slot of a key store is that key;
 * a slot of a character store is the key at the same index of the key store
 * the rules pair it with. A combination that cannot be placed returns [],
 * which {@link isSwallowedByPolicy} reads as "no data".
 */
export function positionsOfCombo(
  ir: KeyboardIR,
  comboId: string,
): Array<{ key: string; modifiers: string }> {
  const rule = ruleById(ir, comboId);
  if (rule !== undefined) {
    return bindingsOfRule(ir, rule).bindings.map((b) => ({ key: b.key, modifiers: b.layer }));
  }
  const slot = parseSlotId(comboId);
  if (slot === null) return [];
  const store = ir.stores.find((s) => s.nodeId === slot.storeNodeId);
  const item = store?.items[slot.itemsIndex];
  if (store === undefined || item === undefined) return [];

  const direct = bindingsOfStoreItem(item);
  if (direct !== undefined) return [{ key: direct.key, modifiers: direct.layer }];

  const out: Array<{ key: string; modifiers: string }> = [];
  for (const group of ir.groups) {
    for (const r of group.rules) {
      for (const el of r.output) {
        if (el.kind !== "index" || el.storeRef !== store.name) continue;
        const ctxEl = r.context[el.offset - 1];
        if (ctxEl?.kind !== "any") continue;
        const keyStore = ir.stores.find((s) => s.name === ctxEl.storeRef);
        const keyItem = keyStore?.items[slot.itemsIndex];
        const b = keyItem === undefined ? undefined : bindingsOfStoreItem(keyItem);
        if (b !== undefined) out.push({ key: b.key, modifiers: b.layer });
      }
    }
  }
  return out;
}

/**
 * One disposition per carved combo id.
 *
 * With a single {@link Disposition} every combo carries that value (the
 * keyboard-wide form). With a per-class {@link FallbackPolicy} each combo takes
 * the class of its leak on the picked base keyboards (FR-015): `leaks` are
 * joined to the combo by position, resolved against `ir`.
 *
 * `comboIds` is the live carve set (deletedNodeIds union deletedItemIds);
 * ids that are not rules or store slots are ignored by the compiler.
 * Duplicates are collapsed; order follows first appearance.
 */
export function dispositionsForFallbackPolicy(
  policy: Disposition | FallbackPolicy,
  comboIds: Iterable<string>,
  perClass?: { ir: KeyboardIR; leaks: readonly Leak[] },
): CarveDisposition[] {
  const byPosition =
    typeof policy === "object" && perClass !== undefined
      ? outcomesByPosition(perClass.leaks)
      : undefined;
  const seen = new Set<string>();
  const out: CarveDisposition[] = [];
  for (const comboId of comboIds) {
    if (seen.has(comboId)) continue;
    seen.add(comboId);
    let swallow: boolean;
    if (typeof policy === "string") {
      swallow = policy === "swallow";
    } else {
      const outcomes: LeakOutcome[] = [];
      if (byPosition !== undefined && perClass !== undefined) {
        for (const p of positionsOfCombo(perClass.ir, comboId)) {
          outcomes.push(...(byPosition.get(positionId(p.key, p.modifiers)) ?? []));
        }
      }
      swallow = isSwallowedByPolicy(policy, outcomes);
    }
    out.push({
      comboId,
      disposition: swallow ? "block" : "allow-host",
      provenance: "bulk-default",
    });
  }
  return out;
}

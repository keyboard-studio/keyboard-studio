// The FR-005 `swallowUndefined` skip-set seam (spec 076, issue #1802, T014).
//
// `swallowUndefined` itself is NOT built here — full FR-005 is future work.
// This module pins the contract it will consume when it recomputes: which
// carved combinations enter the swallow set.
//
// Sequencing (ruling §2): FR-004 codec closure → carve suppression →
// `swallowUndefined`. Leak-handling is uniform (amendment A3): carved combos
// and undefined keys are one host-leak category, so the predicate below also
// answers correctly for never-carved undefined combos — they enter the set,
// which is FR-005's core job.
//
// The predicate is pure and read-only: it never mutates the IR or the
// dispositions.

import type { CarveDisposition, KeyboardIR } from "@keyboard-studio/contracts";
import { parseSlotId } from "./slotId.js";
import { slotGuardNodeIdPrefix } from "./carveSuppression.js";

/**
 * A carved (or undefined) combination, addressed the way dispositions
 * address it: a rule nodeId, or `<storeNodeId>#<index>` for a store-slot
 * carve. (The future FR-005 enumerator maps key+modifiers to these ids;
 * that mapping must not collide with rule nodeIds — see below.)
 */
export interface SwallowCombo {
  comboId: string;
}

/**
 * Should this combination enter the `swallowUndefined` set? (FR-005 amendment)
 *
 * - `allow-host` disposition → NO. The author explicitly chose host fallback;
 *   the swallow must not eat what the author allowed.
 * - Covered by a behaviour-owned rule → NO. Deterministic handling already
 *   exists (a suppression rewrite/guard, or another behaviour's rule);
 *   including the combo would double-emit or shadow-surprise.
 * - Otherwise → YES. Carved combos are undefined keys by construction and
 *   enter the set on recompile; a combo with no disposition record is
 *   treated as carved-but-unrecorded and included — fail-safe toward
 *   suppression, per the ruling's "suppress host leakage by default".
 *   Never-carved undefined combos also enter, which is FR-005's core job.
 *
 * Disposition lookup is first-wins on duplicate comboIds, mirroring
 * `compileCarveSuppression`'s `processed` set.
 */
export function isInSwallowSet(
  combo: SwallowCombo,
  dispositions: CarveDisposition[],
  ir: KeyboardIR,
): boolean {
  const disposition = dispositions.find((d) => d.comboId === combo.comboId);
  if (disposition?.disposition === "allow-host") return false;
  if (isCoveredByBehaviourOwnedRule(combo.comboId, ir)) return false;
  return true;
}

/**
 * Coverage check: does a behaviour-owned rule already handle this combo?
 *
 * - Rule comboIds: a rule nodeId takes precedence over a slot id (mirroring
 *   `compileSlotGuards`). Covered iff the rule itself carries
 *   `ownedByBehaviour`. ANY owner counts, not just "carve-suppression":
 *   FR-002 mutual exclusivity means at most one behaviour owns a rule, and
 *   any owner implies deterministic handling the swallow compiler must not
 *   second-guess (no double emission, no shadowing surprises).
 * - Store-slot comboIds (only when no rule carries that nodeId): covered iff
 *   a behaviour-owned guard was synthesized for exactly this slot — guard
 *   nodeIds carry the slot's prefix (T013).
 */
function isCoveredByBehaviourOwnedRule(comboId: string, ir: KeyboardIR): boolean {
  const ruleExists = ir.groups.some((group) =>
    group.rules.some((rule) => rule.nodeId === comboId),
  );
  if (ruleExists) {
    return ir.groups.some((group) =>
      group.rules.some(
        (rule) => rule.nodeId === comboId && rule.ownedByBehaviour !== undefined,
      ),
    );
  }
  const slot = parseSlotId(comboId);
  if (slot === null) return false;
  const prefix = slotGuardNodeIdPrefix(slot.storeNodeId, slot.itemsIndex);
  return ir.groups.some((group) =>
    group.rules.some(
      (rule) => rule.ownedByBehaviour !== undefined && rule.nodeId.startsWith(prefix),
    ),
  );
}

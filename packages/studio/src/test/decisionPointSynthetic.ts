// applySyntheticEdit -- how each synthetic decision-point fixture (spec 112,
// SYNTHETIC_DECISION_POINT_BASES) differs from the recorded walk it is cut
// from. Pure; the generator applies it, so the committed fixtures are
// reproducible from the record plus this file.

import type { MechanismAssignment } from "@keyboard-studio/contracts";
import type { Decision, DecisionSet } from "../decisions/decisionTypes.ts";
import { alphabetOf, isCasedAlphabet } from "../survey/caps/capsLogic.ts";
import type { DecisionPoint, SyntheticEdit } from "./decisionPointBases.ts";

type PhysicalLayoutValue = { assignments: MechanismAssignment[] };
type InventoryValue = { chars: string[] } & Record<string, unknown>;

const swap = (target: string, kmnRules: string): MechanismAssignment => ({
  scope: "individual",
  target,
  modality: "physical",
  mechanisms: [{ patternId: "simple_swap", strategyId: "S-01", slotValues: { kmnRules } }],
  source: "user",
});

const ralt = (target: string, altgrKeyList: string): MechanismAssignment => ({
  scope: "individual",
  target,
  modality: "physical",
  mechanisms: [
    { patternId: "modifier_as_layer_switch", strategyId: "S-08", slotValues: { altgrKeyList, altgrOutputList: target } },
  ],
  source: "user",
});

function decisionOf<T>(set: DecisionSet, id: "physical-layout" | "character-inventory"): Decision<T> {
  const d = set[id];
  if (d === undefined) throw new Error(`synthetic edit: the source set has no ${id}`);
  return d as Decision<T>;
}

export function applySyntheticEdit(set: DecisionSet, edit: SyntheticEdit): DecisionSet {
  const next: Record<string, Decision<unknown>> = { ...set };
  if (edit === "nonletter-and-ralt") {
    const layout = decisionOf<PhysicalLayoutValue>(set, "physical-layout");
    const inventory = decisionOf<InventoryValue>(set, "character-inventory");
    // eng moves off K_X onto a non-letter key. A pair goes on RAlt of K_N (a
    // letter key: no other plane disagrees), and another on RAlt of K_COMMA,
    // whose base/Shift pair is , and < (a conflict, so it stays out of the set).
    const kept = layout.value.assignments.filter((a) => a.target !== "ŋ" && a.target !== "Ŋ");
    next["physical-layout"] = {
      ...layout,
      value: {
        assignments: [
          ...kept,
          swap("ŋ", "+ [K_BKSLASH] > U+014B"),
          swap("Ŋ", "+ [SHIFT K_BKSLASH] > U+014A"),
          ralt("ɓ", "[RALT K_N]"),
          ralt("Ɓ", "[SHIFT RALT K_N]"),
          ralt("ɗ", "[RALT K_COMMA]"),
          ralt("Ɗ", "[SHIFT RALT K_COMMA]"),
        ],
      },
    };
    next["character-inventory"] = {
      ...inventory,
      value: { ...inventory.value, chars: [...new Set([...inventory.value.chars, "ɓ", "Ɓ"])] },
    };
  } else if (edit === "caseless") {
    const inventory = decisionOf<InventoryValue>(set, "character-inventory");
    next["character-inventory"] = { ...inventory, value: { ...inventory.value, chars: ["ก", "ข", "ค"] } };
    delete next["caps-handling"];
  } else {
    next["caps-handling"] = { id: "caps-handling", value: { mode: "explicit-rules" }, provenance: "asked" };
  }
  return next as DecisionSet;
}

/**
 * The walk records predate the caps-handling decision, so their cut sets carry
 * none. The studio would have seeded the module default for a cased alphabet
 * (spec 112), so the committed fixtures do the same from the `caps` point on,
 * with the studio's own provenance. recordToDecisionSet stays a pure cut.
 */
export function seedCapsHandling(set: DecisionSet, point: DecisionPoint): DecisionSet {
  if (point !== "caps" && point !== "tolerance") return set;
  if (set["caps-handling"] !== undefined) return set;
  if (!isCasedAlphabet(alphabetOf(set["character-inventory"]?.value))) return set;
  return { ...set, "caps-handling": { id: "caps-handling", value: { mode: "cased-keys" }, provenance: "default" } };
}

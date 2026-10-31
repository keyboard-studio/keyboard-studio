// KNOWN_GAPS -- the decision-point gate failures a later story or issue owns
// (spec 106 US1). Shared by the decision-point fixtures and the headless
// author (spec 107 FR-030), so both report the same owner for the same gap.
// The story that closes one removes its row here.

import { DECISION_POINTS, type DecisionPoint } from "./decisionPointBases.ts";
import type { GateId } from "./consistencyGates.ts";

/** What each gap is waiting on. G6 is walk-only, so it has no row here. */
export type Owner = "US5" | "US6" | "#2361" | "#2363" | "#2397";

export interface Gap {
  gate: GateId;
  owner: Owner;
  bases: readonly string[];
  points: readonly DecisionPoint[];
}

// Measured, not assumed: a gate that already passes on a fixture has no row,
// even where the spec names a story for it (G2 on basic_kbdus / basic_kbdfr and
// G5 everywhere pass today, because those fixtures do not yet contain the shape
// the story fixes).
export const KNOWN_GAPS: readonly Gap[] = [
  // E5: contexts are not tolerant (camqwerty has one gap).
  { gate: "G2", owner: "US6", bases: ["sil_cameroon_qwerty"], points: ["tolerance"] },
  // Not E5: the tolerance analysis itself throws on camazerty, because it hands
  // a rule keyed to a touch-only T_ key to the desktop simulator. The live
  // station calls the same analysis, so this is an engine defect of its own.
  { gate: "G2", owner: "#2363", bases: ["sil_cameroon_azerty"], points: ["tolerance"] },
  // nul/beep inside starting stores is deferred to keymanapp/keyboards#4181.
  { gate: "G8-start", owner: "#2361", bases: ["sil_cameroon_qwerty", "sil_cameroon_azerty"], points: DECISION_POINTS },
  // Carving every slot of an any() store: the removal pass will not empty the
  // store, the guards block what is left, and the rule is dead (4 unreachable
  // hints). Measured by the headless author's PR set at its default point.
  { gate: "G1", owner: "#2397", bases: ["bj_cree_woods"], points: ["tolerance"] },
];

export function ownerOf(base: string, point: DecisionPoint, gate: GateId): Owner | undefined {
  return KNOWN_GAPS.find((g) => g.gate === gate && g.bases.includes(base) && g.points.includes(point))?.owner;
}


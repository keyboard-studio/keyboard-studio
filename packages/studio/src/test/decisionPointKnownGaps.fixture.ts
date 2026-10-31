// KNOWN_GAPS -- the decision-point gate failures a later story or issue owns
// (spec 106 US1). Shared by the decision-point fixtures and the headless
// author (spec 107 FR-030), so both report the same owner for the same gap.
// The story that closes one removes its row here.

import { DECISION_POINTS, type DecisionPoint } from "./decisionPointBases.ts";
import type { GateId } from "./consistencyGates.ts";

/** What each gap is waiting on. */
export type Owner = "US5" | "US6" | "#2361" | "#2363" | "#2400";

export interface Gap {
  gate: GateId;
  owner: Owner;
  bases: readonly string[];
  points: readonly DecisionPoint[];
  /**
   * Only where the touch step was walked (the headless author, spec 107). The
   * decision-point replay never installs a touch layout, so G6 is not
   * applicable there and such a row would not hold.
   */
  walkOnly?: boolean;
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
  // G6 reads only default-layer key labels, with no starting-content split and
  // no credit for keys that reach a letter through the .kmn rules. The listed
  // bases are the ones whose measured G6 gap is recorded; a keyboard with a
  // usable touch layout can show it.
  {
    gate: "G6",
    owner: "#2400",
    bases: ["basic_kbdus", "basic_kbdfr", "sil_cameroon_qwerty", "sil_cameroon_azerty", "chechen_latin"],
    points: ["tolerance"],
    walkOnly: true,
  },
];

/** `walked: false` for a replay that did not walk the touch step (walk-only rows do not apply). */
export function ownerOf(
  base: string,
  point: DecisionPoint,
  gate: GateId,
  { walked = true }: { walked?: boolean } = {},
): Owner | undefined {
  return KNOWN_GAPS.find(
    (g) =>
      g.gate === gate && g.bases.includes(base) && g.points.includes(point) && (walked || g.walkOnly !== true),
  )?.owner;
}


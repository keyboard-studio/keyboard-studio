// KNOWN_GAPS -- the decision-point gate failures a later story or issue owns
// (spec 106 US1). Shared by the decision-point fixtures and the headless
// author (spec 107 FR-030), so both report the same owner for the same gap.
// The story that closes one removes its row here.

import { DECISION_POINTS, type DecisionPoint } from "./decisionPointBases.ts";
import type { GateId } from "./consistencyGates.ts";

/** What each gap is waiting on. */
export type Owner = "US6" | "#2361";

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
// even where the spec names a story for it (G2 on basic_kbdus / basic_kbdfr).
// G5 passes on every base, chechen_latin included (ç/Ç on K_COLON), since the
// store is derived in projection (spec 112).
export const KNOWN_GAPS: readonly Gap[] = [
  // E5: contexts are not tolerant (camazerty has 16 measured gaps after US6,
  // down from 17: the default-accepted normalization step fixed one). #2363's
  // crash is fixed -- the analysis runs and skips the 13 touch-only T_ rules
  // with a not-analysed reason -- but the remaining gaps are genuine
  // canonical-equivalence gaps the pre-US6 walk never normalised. The step
  // the default accepts does not cover them: every remaining finding is a
  // rule matching precomposed `è` followed by a second mark, a
  // normalization-coverage follow-up, not a default-accept gap.
  { gate: "G2", owner: "US6", bases: ["sil_cameroon_azerty"], points: ["tolerance"] },
  // nul/beep inside starting stores is deferred to keymanapp/keyboards#4181.
  { gate: "G8-start", owner: "#2361", bases: ["sil_cameroon_qwerty", "sil_cameroon_azerty"], points: DECISION_POINTS },
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


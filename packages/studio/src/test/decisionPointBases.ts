// The decision-point fixture matrix: one walk record per corpus base keyboard
// (spec 106 US1). Shared by scripts/genDecisionPoints.ts (which writes the
// fixtures) and the fixture suites (which read them back), so the directory a
// fixture lands in and the base it is loaded from cannot drift apart.

export const DECISION_POINTS = ["marks", "carve", "assignments", "caps", "tolerance"] as const;
export type DecisionPoint = (typeof DECISION_POINTS)[number];

export interface DecisionPointBase {
  /** Corpus keyboard id (the `base-keyboard` decision's id). */
  base: string;
  /** Corpus group directory under keyboards/release. */
  group: string;
  script: string;
  displayName: string;
  /** The walk case the record came from (see records/PROVENANCE.md). */
  profile: string;
  /** Record file under src/lib/__fixtures__/decision-points/records. */
  recordFile: string;
  track: "copy" | "adapt";
}

export const DECISION_POINT_BASES: readonly DecisionPointBase[] = [
  {
    base: "basic_kbdus",
    group: "basic",
    script: "Latn",
    displayName: "US Basic",
    profile: "p1-whole-bafut-kbdus",
    recordFile: "kbdus.json",
    track: "copy",
  },
  {
    base: "sil_cameroon_qwerty",
    group: "sil",
    script: "Latn",
    displayName: "Cameroon QWERTY",
    profile: "p4-unwrap-bafut-camqwerty",
    recordFile: "camqwerty.json",
    track: "copy",
  },
  {
    base: "basic_kbdfr",
    group: "basic",
    script: "Latn",
    displayName: "French Basic",
    profile: "p1-whole-ewondo-kbdfr",
    recordFile: "kbdfr.json",
    track: "copy",
  },
  {
    base: "sil_cameroon_azerty",
    group: "sil",
    script: "Latn",
    displayName: "Cameroon AZERTY",
    profile: "p4-unwrap-ewondo-camazerty",
    recordFile: "camazerty.json",
    track: "copy",
  },
];

/**
 * Synthetic copy fixtures (spec 112): a walk record with its decisions edited
 * to put a case in front of the caps rules that the four recorded walks do not
 * reach. Kept apart from DECISION_POINT_BASES so the suites that sweep every
 * recorded base do not pick them up; the generator writes them beside the
 * recorded ones and `applySyntheticEdit` (decisionPointSynthetic.ts) is the
 * only place that says how each differs from its source.
 */
export type SyntheticEdit = "nonletter-and-ralt" | "caseless" | "explicit-rules";

export interface SyntheticDecisionPointBase extends DecisionPointBase {
  edit: SyntheticEdit;
  /** The one decision point the synthetic fixture is cut at. */
  point: DecisionPoint;
}

export const SYNTHETIC_DECISION_POINT_BASES: readonly SyntheticDecisionPointBase[] = [
  // eng and its capital on a non-letter key, a pair on RAlt of a letter key,
  // and a pair on RAlt of a key whose base/Shift pair disagrees (an R1 conflict).
  { ...fromBase("basic_kbdus"), profile: "synthetic-nonletter-ralt", edit: "nonletter-and-ralt", point: "caps" },
  // A caseless alphabet is not asked: no decision, nothing written.
  { ...fromBase("basic_kbdus"), profile: "synthetic-caseless", edit: "caseless", point: "caps" },
  // The author kept the copy's own caps handling: nothing is written or removed.
  { ...fromBase("basic_kbdus"), profile: "synthetic-explicit-rules", edit: "explicit-rules", point: "caps" },
];

function fromBase(base: string): DecisionPointBase {
  const found = DECISION_POINT_BASES.find((b) => b.base === base);
  if (found === undefined) throw new Error(`decisionPointBases: no recorded base "${base}"`);
  return found;
}

/** Repo-relative-to-studio directory the generated fixtures live in. */
export const DECISION_POINT_FIXTURE_DIR = "src/lib/__fixtures__/decision-points";

export function fixtureRelPath(b: DecisionPointBase, point: DecisionPoint): string {
  return `${b.base}/${b.profile}/${point}.decisions.json`;
}

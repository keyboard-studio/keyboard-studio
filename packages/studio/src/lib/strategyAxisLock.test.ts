// Spec 022 — §7.5 strategy-axis regression lock (FR-006 / FR-007, SC-004).
//
// The demotion of the orphaned full non-identity Phase A removes NO runtime
// strategy-axis elicitor from the DEFAULT build-list path: the `pb_*` battery
// (the sole runtime elicitor of A1/A3/A4) is NOT demoted (Amendment 2026-06-29 —
// it stays a live, reachable, non-default branch), and the default BuildListView
// path already leaves A1 (scale) / A3 (phoneticIntuition) / A4 (diacriticBehavior)
// UNELICITED today (it collects confirmedInventory only). So this is a Tier-2-style
// regression LOCK proving the demotion is byte-identical on the default path:
//
//   1. selectStrategy output (recommended primary + secondaries) on the §7.5
//      exemplar rows is pinned — the strategy selector and its inputs are untouched
//      by this spec (the studio reaches it via the SAME @keyboard-studio/engine
//      selectStrategy that browserPatternLibrary.ts:160 calls).
//   2. The DEFAULT-PATH gap is locked: with A1/A3/A4 unelicited, the merged session
//      axis vector (mergePhaseResults) is a PARTIAL DiscoveryAxisVector missing
//      scale/phoneticIntuition/diacriticBehavior — exactly today's pre-existing gap.
//      The demotion neither introduces nor widens it; per-character re-elicitation
//      (D2) is DEFERRED to Phase 2 and is NOT added here (FR-007).
//
// Co-located with the studio strategy-selection exemplars (browserPatternLibrary.test.ts).
// Test-only: no contracts bump, no write routing, no flag flip (FR-010/FR-011).

import { describe, it, expect } from "vitest";
import { selectStrategy } from "@keyboard-studio/engine";
import { mergePhaseResults } from "@keyboard-studio/contracts";
import type { DiscoveryAxisVector, SurveyPhaseResult } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// §7.5 exemplar rows — the full-axis-vector inputs and their LOCKED selectStrategy
// outputs (recommended primary + secondaries). Mirrors the engine's §7.5 seed
// fixtures (strategy-selector/index.test.ts) at the studio boundary so a change to
// the selector's default-path output is caught from the consumer side too.
// ---------------------------------------------------------------------------

interface Exemplar {
  name: string;
  axes: DiscoveryAxisVector;
  primary: string;
  /** secondaries that MUST be present (subset match — order/extra-agnostic where noted). */
  secondariesContain: string[];
  /** when set, secondaries MUST equal this exactly. */
  secondariesEqual?: string[];
}

const A = (o: Partial<DiscoveryAxisVector>): DiscoveryAxisVector => ({
  scale: "small",
  scriptClass: "alphabetic",
  phoneticIntuition: "weak",
  diacriticBehavior: "none",
  multiMode: "single",
  constraintEnforcement: "none",
  spareKeyAvailability: "many",
  remapPosture: "addition",
  ...o,
});

const EXEMPLARS: Exemplar[] = [
  { name: "akan", axes: A({ scale: "tiny", phoneticIntuition: "strong" }), primary: "S-01", secondariesContain: [], secondariesEqual: [] },
  { name: "sil_euro_latin", axes: A({ scale: "large", phoneticIntuition: "strong", diacriticBehavior: "multi-family", spareKeyAvailability: "RAlt only" }), primary: "S-05", secondariesContain: ["S-04"] },
  { name: "sil_ipa", axes: A({ scale: "medium", phoneticIntuition: "strong" }), primary: "S-05", secondariesContain: ["S-04"] },
  { name: "sil_devanagari_phonetic", axes: A({ scale: "medium", scriptClass: "abugida", clusterSensitivity: true, phoneticIntuition: "strong", remapPosture: undefined }), primary: "S-09", secondariesContain: ["S-05"] },
  { name: "vietnamese_telex", axes: A({ scale: "medium", phoneticIntuition: "strong", diacriticBehavior: "replacing-cycling" }), primary: "S-07", secondariesContain: ["S-04"] },
  { name: "sil_yoruba8", axes: A({ scale: "medium", phoneticIntuition: "strong", diacriticBehavior: "multi-family", multiMode: "two-orthography" }), primary: "S-11", secondariesContain: [], secondariesEqual: [] },
  { name: "armenian_mnemonic_r", axes: A({ scale: "medium", spareKeyAvailability: "RAlt only", remapPosture: "full-remap" }), primary: "S-06", secondariesContain: ["S-04", "S-08"] },
  { name: "el_pasifika", axes: A({ scale: "small", phoneticIntuition: "strong", diacriticBehavior: "stacking-combining", constraintEnforcement: "loud" }), primary: "S-02", secondariesContain: ["S-04", "S-10"] },
  { name: "cs_pinyin", axes: A({ scale: "massive", scriptClass: "logographic", remapPosture: undefined }), primary: "S-12", secondariesContain: [], secondariesEqual: [] },
  { name: "itrans_devanagari_hindi", axes: A({ scale: "large", scriptClass: "abugida", clusterSensitivity: true, phoneticIntuition: "strong", multiMode: "two-orthography", remapPosture: undefined }), primary: "S-09", secondariesContain: ["S-05", "S-11"] },
  { name: "sil_pan_africa_mnemonic", axes: A({ scale: "large", diacriticBehavior: "multi-family" }), primary: "S-06", secondariesContain: ["S-04"] },
  { name: "arabic_izza", axes: A({ scale: "medium", scriptClass: "abjad", remapPosture: undefined }), primary: "S-09", secondariesContain: [], secondariesEqual: [] },
  { name: "russian_mnemonic_r", axes: A({ scale: "medium", spareKeyAvailability: "RAlt only", remapPosture: "full-remap" }), primary: "S-06", secondariesContain: ["S-04", "S-08"] },
];

describe("spec 022 — §7.5 strategy-axis regression lock (selectStrategy output unchanged)", () => {
  for (const ex of EXEMPLARS) {
    it(`§7.5 ${ex.name}: selectStrategy output is locked across the demotion`, () => {
      const rec = selectStrategy(ex.axes);
      expect(rec.primary, `${ex.name} primary`).toBe(ex.primary);
      for (const s of ex.secondariesContain) {
        expect(rec.secondaries, `${ex.name} secondaries must contain ${s}`).toContain(s);
      }
      if (ex.secondariesEqual !== undefined) {
        expect(rec.secondaries, `${ex.name} secondaries exact`).toEqual(ex.secondariesEqual);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Default-build-list-path gap lock (FR-007 / SC-004).
//
// On the default path A1/A3/A4 are unelicited. The studio's filterFor completeness
// gate (browserPatternLibrary / MechanismGallery: a complete DiscoveryAxisVector
// requires scale + scriptClass + phoneticIntuition + diacriticBehavior + multiMode
// + constraintEnforcement + spareKeyAvailability all present) therefore yields a
// PARTIAL vector — the pre-existing gap. This locks that the merged session vector
// on the default path is missing exactly scale (A1) / phoneticIntuition (A3) /
// diacriticBehavior (A4), and that demoting Phase A does not change that.
// ---------------------------------------------------------------------------

describe("spec 022 — default build-list path: the A1/A3/A4 gap is pre-existing and unchanged", () => {
  // A default-path Phase B result: confirmedInventory only, no computedAxes
  // (BuildListView collects inventory only; A1/A3/A4 are NOT elicited).
  const defaultPhaseB: SurveyPhaseResult = {
    phase: "B",
    answers: [],
    confirmedInventory: ["a", "b", "c"],
    // computedAxes deliberately undefined — the default path elicits no axis.
  };

  // irAxes carries only the script-class prior (A2), as identity-lite/prefill derive
  // it from the target script — A1/A3/A4 are NOT in the prior.
  const scriptClassPrior: Partial<DiscoveryAxisVector> = { scriptClass: "alphabetic" };

  it("merged session axes omit A1 (scale) / A3 (phoneticIntuition) / A4 (diacriticBehavior)", () => {
    const session = mergePhaseResults(scriptClassPrior, [defaultPhaseB]);
    expect(session.axes.scale, "A1 must be unelicited on the default path").toBeUndefined();
    expect(session.axes.phoneticIntuition, "A3 must be unelicited on the default path").toBeUndefined();
    expect(session.axes.diacriticBehavior, "A4 must be unelicited on the default path").toBeUndefined();
    // The script-class prior (A2) is present — the only axis the default path carries.
    expect(session.axes.scriptClass).toBe("alphabetic");
  });

  it("the partial vector is NOT a complete DiscoveryAxisVector (filterFor falls back to appliesTo, not selectStrategy)", () => {
    const session = mergePhaseResults(scriptClassPrior, [defaultPhaseB]);
    const isComplete =
      session.axes.scale !== undefined &&
      session.axes.scriptClass !== undefined &&
      session.axes.phoneticIntuition !== undefined &&
      session.axes.diacriticBehavior !== undefined &&
      session.axes.multiMode !== undefined &&
      session.axes.constraintEnforcement !== undefined &&
      session.axes.spareKeyAvailability !== undefined;
    // The pre-existing gap: the default-path vector is incomplete, exactly as today.
    // Demoting the orphaned Phase A (which never elicited A1/A3/A4 either) does not
    // change this — it is byte-identical default-path behavior.
    expect(isComplete).toBe(false);
  });

  it("confirmedInventory (the only default-path output) is unchanged by axis gap", () => {
    const session = mergePhaseResults(scriptClassPrior, [defaultPhaseB]);
    expect(session.confirmedInventory).toEqual(["a", "b", "c"]);
  });
});

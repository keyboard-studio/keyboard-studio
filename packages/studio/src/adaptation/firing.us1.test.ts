// T010 (US1) — script-alignment firing against a MOCKED index.
//
// Independent test: with injected evidence, multi-script siblings fire q_sa1;
// dominant-script disagreement / "mixed" base fires q_sa2; a Latin subprofile
// disagreement fires q_sa3; and when all signals agree, NOTHING fires (SC-002,
// the non-interruption bar).

import { describe, it, expect } from "vitest";
import { evaluateFiringConditions } from "./firing.ts";
import type { AdaptationEvidence } from "./evidence.ts";
import type { QuestionRecord } from "./catalog.ts";
import { TRUST_POLICY_DEFAULTS } from "./trustPolicy.ts";

// The three script-alignment records, inline so the test is isolated from the
// bundled catalog. Mirrors content/adaptation-questions/q_sa*.yaml.
const SA_CATALOG: QuestionRecord[] = [
  {
    id: "q_sa1_target_script_spread",
    family: "script-alignment",
    elicits: "which script community",
    firingCondition: "sibling-script-spread > 1",
    prefill: { facets: ["script"], sessionFacet: "lineage.siblings" },
    provenanceLabel: "scripts used by existing keyboards for related languages",
    consumers: ["base-suggestion:ranking", "axis:A5"],
    noEvidenceDegradation: "ask-plainly",
    scope: "session",
    renders: true,
    status: "candidate",
  },
  {
    id: "q_sa2_base_script_mismatch",
    family: "script-alignment",
    elicits: "retarget base script",
    firingCondition: "dominant-script-disagreement OR base-script == mixed",
    prefill: { facets: ["script"], sessionFacet: "lineage.nearest-neighbors" },
    provenanceLabel: "the base keyboard's own script vs the script you chose",
    consumers: ["base-suggestion:ranking"],
    noEvidenceDegradation: "ask-plainly",
    scope: "session",
    renders: true,
    status: "candidate",
  },
  {
    id: "q_sa3_latin_flavor",
    family: "script-alignment",
    elicits: "latin sub-profile",
    firingCondition: "target == Latn AND latin-subprofile-disagreement",
    prefill: { facets: ["script"], sessionFacet: "orth.regional-variant" },
    provenanceLabel: "the base keyboard's Latin sub-profile",
    consumers: ["placement:punctuation-defaults", "axis:A2"],
    noEvidenceDegradation: "ask-plainly",
    scope: "session",
    renders: true,
    status: "candidate",
  },
];

/** A clean, all-signals-agree base evidence bundle (fires nothing). */
function cleanEvidence(overrides: Partial<AdaptationEvidence> = {}): AdaptationEvidence {
  return {
    targetScript: "Latn",
    baseScriptDistribution: { Latn: 1.0 },
    siblingScriptSpread: { Latn: 4 },
    latinSubProfile: "plain",
    strategyFingerprint: { distribution: { "S-01": 0.9 }, residue: 0.1 },
    baseTargetMix: ["desktop"],
    statedDeviceMix: ["desktop"],
    provenanceTier: "content-derived",
    ...overrides,
  };
}

const fire = (e: AdaptationEvidence) =>
  evaluateFiringConditions(e, TRUST_POLICY_DEFAULTS, SA_CATALOG).map((q) => q.id);

describe("US1 script-alignment firing", () => {
  it("fires q_sa1 when related keyboards span more than one script (with corpus counts as evidence)", () => {
    const e = cleanEvidence({ siblingScriptSpread: { Arab: 3, Latn: 2 } });
    const fired = evaluateFiringConditions(e, TRUST_POLICY_DEFAULTS, SA_CATALOG);
    const sa1 = fired.find((q) => q.id === "q_sa1_target_script_spread");
    expect(sa1).toBeDefined();
    expect(sa1!.provenanceLabel).toContain("related languages");
    expect(sa1!.prefilledValue).toBe("Latn");
  });

  it("fires q_sa2 when the base's dominant script disagrees with the target", () => {
    const e = cleanEvidence({ targetScript: "Latn", baseScriptDistribution: { Arab: 1.0 } });
    expect(fire(e)).toContain("q_sa2_base_script_mismatch");
  });

  it("fires q_sa2 when the base is script-mixed under the threshold", () => {
    const e = cleanEvidence({ baseScriptDistribution: { Latn: 0.6, Arab: 0.4 } });
    expect(fire(e)).toContain("q_sa2_base_script_mismatch");
  });

  it("fires q_sa3 when the target is Latin and the base's sub-profile disagrees", () => {
    const e = cleanEvidence({ targetScript: "Latn", latinSubProfile: "ipa" });
    expect(fire(e)).toContain("q_sa3_latin_flavor");
  });

  it("fires NOTHING when all signals agree — the non-interruption bar (SC-002)", () => {
    expect(fire(cleanEvidence())).toEqual([]);
  });

  it("q_sa3 does not fire for a non-Latin target even with a sub-profile present", () => {
    const e = cleanEvidence({ targetScript: "Arab", latinSubProfile: "ipa", baseScriptDistribution: { Arab: 1 }, siblingScriptSpread: { Arab: 3 } });
    expect(fire(e)).not.toContain("q_sa3_latin_flavor");
  });
});

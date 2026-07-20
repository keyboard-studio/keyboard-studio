// T027 (US3) — the trust dial visibly changes prefill/routing, and every
// resolution is recorded (SC-006). Lowering singleScriptThreshold reclassifies a
// mixed base to single-script (with the policy named in provenance); raising it
// routes the same base to a US1 confirmation. Fallback-tier prefills stay
// visually distinguishable regardless of the fallback dial (FR-006). Scope
// persistence degrades workflow → session (Decision 6).

import { describe, it, expect, beforeEach } from "vitest";
import {
  resolveTrustPolicy,
  persistTrustPolicy,
  loadTrustPolicy,
  resetTrustPolicyStore,
  recordPolicyResolution,
  TRUST_POLICY_DEFAULTS,
} from "./trustPolicy.ts";
import { classifyBaseScript, evaluateFiringConditions } from "./firing.ts";
import type { AdaptationEvidence } from "./evidence.ts";
import type { QuestionRecord } from "./catalog.ts";
import { readConfirmationEvents, resetConfirmationEvents } from "./confirmationEvents.ts";

const SA2: QuestionRecord[] = [
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
];

// A base that is Latn-dominant at 0.7 — "mixed" under the 0.80 default, but
// "single-script" if the threshold drops to 0.6. Target agrees (Latn), so only
// the threshold decides whether q_sa2 fires.
function borderlineBase(overrides: Partial<AdaptationEvidence> = {}): AdaptationEvidence {
  return {
    targetScript: "Latn",
    baseScriptDistribution: { Latn: 0.7, Arab: 0.3 },
    siblingScriptSpread: { Latn: 3 },
    latinSubProfile: "plain",
    strategyFingerprint: { distribution: { "S-01": 0.9 }, residue: 0.1 },
    baseTargetMix: ["desktop"],
    statedDeviceMix: ["desktop"],
    provenanceTier: "content-derived",
    ...overrides,
  };
}

beforeEach(() => {
  resetTrustPolicyStore();
  resetConfirmationEvents();
});

describe("trust threshold reclassifies and routes (US3)", () => {
  it("lowering the threshold reclassifies mixed → single-script, naming the policy in provenance", () => {
    const evidence = borderlineBase();
    const lenient = resolveTrustPolicy({ singleScriptThreshold: 0.6 });
    const cls = classifyBaseScript(evidence, lenient);
    expect(cls.posture).toBe("single-script");
    expect(cls.provenance).toContain("60%"); // the threshold that decided it is named
  });

  it("the default threshold leaves the same base mixed → routes to the q_sa2 confirmation", () => {
    const evidence = borderlineBase();
    const fired = evaluateFiringConditions(evidence, TRUST_POLICY_DEFAULTS, SA2).map((q) => q.id);
    expect(fired).toContain("q_sa2_base_script_mismatch");
  });

  it("lowering the threshold suppresses the q_sa2 confirmation for the same base", () => {
    const evidence = borderlineBase();
    const lenient = resolveTrustPolicy({ singleScriptThreshold: 0.6 });
    const fired = evaluateFiringConditions(evidence, lenient, SA2).map((q) => q.id);
    expect(fired).not.toContain("q_sa2_base_script_mismatch");
  });
});

describe("fallback-tier prefills stay distinguishable (FR-006)", () => {
  it("a fallback-tier fired question carries its tier even when prefill is allowed", () => {
    const evidence = borderlineBase({ provenanceTier: "language-default" });
    const [fired] = evaluateFiringConditions(evidence, TRUST_POLICY_DEFAULTS, SA2);
    expect(fired.provenanceTier).toBe("language-default");
    expect(fired.prefilledValue).toBe("Latn"); // allowed, but still marked by tier
  });

  it("disallowing fallback-tier prefill nulls the value without dropping the question", () => {
    const evidence = borderlineBase({ provenanceTier: "language-default" });
    const strict = resolveTrustPolicy({ allowFallbackTierPrefill: false });
    const [fired] = evaluateFiringConditions(evidence, strict, SA2);
    expect(fired.id).toBe("q_sa2_base_script_mismatch"); // still fires
    expect(fired.prefilledValue).toBeNull(); // no silent drop; ask form
    expect(fired.provenanceTier).toBe("language-default"); // still marked
  });
});

describe("scope persistence (Decision 6)", () => {
  it("workflow-scoped policy is shared by workflow id; degrades to session without one", () => {
    const p = resolveTrustPolicy({ singleScriptThreshold: 0.6 });
    const stored = persistTrustPolicy(p, "wf_1");
    expect(stored.scope).toBe("workflow");
    expect(loadTrustPolicy("wf_1").singleScriptThreshold).toBe(0.6);

    // A workflow with no persisted policy falls back to the session policy, then defaults.
    expect(loadTrustPolicy("wf_unknown")).toEqual(TRUST_POLICY_DEFAULTS);
    const sessionStored = persistTrustPolicy(resolveTrustPolicy({ singleScriptThreshold: 0.95 }));
    expect(sessionStored.scope).toBe("session");
    expect(loadTrustPolicy().singleScriptThreshold).toBe(0.95);
  });
});

describe("policy resolutions are recorded (SC-006)", () => {
  it("records exactly one event per dial, marking confirmed vs overridden", () => {
    recordPolicyResolution("q_tp1_confidence_threshold", "0.8"); // == default → confirmed
    recordPolicyResolution("q_tp2_fallback_tier_prefill", "ask"); // != default → overridden
    const events = readConfirmationEvents();
    expect(events).toHaveLength(2);
    const tp1 = events.find((e) => e.questionId === "q_tp1_confidence_threshold");
    const tp2 = events.find((e) => e.questionId === "q_tp2_fallback_tier_prefill");
    expect(tp1?.action).toBe("confirmed");
    expect(tp2?.action).toBe("overridden");
    expect(tp1?.provenanceTier).toBe("declared-metadata");
    expect(tp1?.at).toBeTruthy();
  });
});

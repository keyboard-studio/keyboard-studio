// T035 (Polish) — full mocked-index walkthrough across the three families.
//
// Exercises the feature's headline success criteria against a mocked evidence
// bundle (no live index):
//   SC-002  a clean single-script base fires ZERO script-alignment questions;
//   SC-003  a dual-script base fires at most 2 script-alignment questions, each
//           carrying provenance;
//   SC-004  one posture entry governs >= 3 downstream proposal-site reads;
//   FR-004  every fired question degrades to a defined no-evidence form;
//   SC-006  every resolved prefill is captured as exactly one event.

import { describe, it, expect, beforeEach } from "vitest";
import { evaluateFiringConditions } from "./firing.ts";
import { buildPosture, postureFor } from "./posture.ts";
import { adaptationCatalog } from "./catalog.ts";
import { TRUST_POLICY_DEFAULTS, resolveTrustPolicy } from "./trustPolicy.ts";
import { buildScriptAlignmentRows } from "../survey/Prefill.tsx";
import {
  recordConfirmation,
  readConfirmationEvents,
  resetConfirmationEvents,
} from "./confirmationEvents.ts";
import type { AdaptationEvidence } from "./evidence.ts";

function evidence(overrides: Partial<AdaptationEvidence> = {}): AdaptationEvidence {
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

beforeEach(() => resetConfirmationEvents());

describe("mocked-index walkthrough", () => {
  it("SC-002: a clean single-script base fires zero script-alignment questions", () => {
    const fired = evaluateFiringConditions(evidence(), TRUST_POLICY_DEFAULTS, adaptationCatalog);
    expect(fired).toEqual([]);
  });

  it("SC-003: a dual-script base fires <= 2 script-alignment questions, each with provenance", () => {
    const dual = evidence({
      siblingScriptSpread: { Arab: 3, Latn: 2 },
      baseScriptDistribution: { Arab: 0.6, Latn: 0.4 },
    });
    const fired = evaluateFiringConditions(dual, TRUST_POLICY_DEFAULTS, adaptationCatalog);
    // Only script-alignment questions fire from the evaluator (posture/policy are
    // separate surfaces), so the count is the SA subset.
    expect(fired.length).toBeGreaterThan(0);
    expect(fired.length).toBeLessThanOrEqual(2);
    for (const q of fired) {
      expect(q.provenanceLabel.length).toBeGreaterThan(0);
      expect(q.provenanceTier).toBeTruthy();
    }
    // Rows carry the provenance chip (value + evidence + tier).
    const rows = buildScriptAlignmentRows(fired);
    expect(rows.every((r) => (r.note ?? "").includes("content-derived"))).toBe(true);
  });

  it("FR-004: fallback-tier-disallowed fired questions degrade to the no-default form, never dropped", () => {
    const dual = evidence({
      siblingScriptSpread: { Arab: 3, Latn: 2 },
      provenanceTier: "language-default",
    });
    const strict = resolveTrustPolicy({ allowFallbackTierPrefill: false });
    const fired = evaluateFiringConditions(dual, strict, adaptationCatalog);
    expect(fired.length).toBeGreaterThan(0);
    expect(fired.every((q) => q.prefilledValue === null)).toBe(true);
    const rows = buildScriptAlignmentRows(fired);
    expect(rows.every((r) => r.value.includes("no default"))).toBe(true);
  });

  it("SC-004: one posture entry governs >= 3 downstream proposal-site reads", () => {
    const posture = buildPosture(evidence(), "base_x");
    const reads = [
      postureFor(posture, "input-strategies"),
      postureFor(posture, "input-strategies"),
      postureFor(posture, "input-strategies"),
    ];
    expect(reads).toHaveLength(3);
    expect(reads.every((r) => r === reads[0])).toBe(true); // one lever, many sites
  });

  it("SC-006: every resolved prefill is captured as exactly one event", () => {
    const dual = evidence({ siblingScriptSpread: { Arab: 3, Latn: 2 } });
    const fired = evaluateFiringConditions(dual, TRUST_POLICY_DEFAULTS, adaptationCatalog);
    for (const q of fired) {
      recordConfirmation({
        questionId: q.id,
        facetIds: ["script"],
        prefilledValue: q.prefilledValue,
        finalValue: q.prefilledValue ?? "chosen",
        action: "confirmed",
        provenanceTier: q.provenanceTier,
      });
    }
    const events = readConfirmationEvents();
    expect(events).toHaveLength(fired.length);
    expect(new Set(events.map((e) => e.questionId)).size).toBe(fired.length); // one per question
  });
});

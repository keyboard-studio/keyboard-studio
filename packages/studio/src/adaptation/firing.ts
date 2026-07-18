// Firing-condition evaluation (spec 038; contract §1).
//
// Pure and deterministic for a given (evidence, policy, catalog). Reads the
// catalog + trust policy and returns ONLY the questions whose firingCondition
// holds. Confident agreement returns NO FiredQuestion (SC-002 — the headline
// non-interruption bar) but still yields a pre-confirmed chip via
// `prefilledValue` on the consuming surface (Prefill rows / posture step).
//
// Firing predicates for the SCRIPT-ALIGNMENT family (US1) live here, keyed by
// catalog id — the loose `firingCondition` string in the record is the
// lint-checked documentation of the same predicate. The inheritance-posture
// family is handled by posture.ts (an en-masse builder, not per-question
// firing); the trust-policy family are the dials that feed `TrustPolicy`
// itself. TrustPolicy governs the script-alignment predicates here: the
// single-script threshold drives the "mixed" determination (Q-TP1), and the
// fallback-tier prefill permission nulls a prefill without dropping the
// question (Q-TP2).

import type { AdaptationEvidence } from "./evidence.ts";
import { dominantEntry } from "./evidence.ts";
import type { TrustPolicy } from "./trustPolicy.ts";
import { adaptationCatalog, type QuestionRecord } from "./catalog.ts";

export interface FiredQuestion {
  /** Catalog id of the fired question. */
  id: string;
  /** The derived §3c default; null → the no-evidence form (FR-004). */
  prefilledValue: string | null;
  /** The §3c provenance-chip text (from the catalog record). */
  provenanceLabel: string;
  /** The tier that produced the evidence — carried so chips stay distinguishable (FR-006). */
  provenanceTier: AdaptationEvidence["provenanceTier"];
}

/** The base's script posture under the current threshold — a §3c classification. */
export interface ScriptClassification {
  posture: "single-script" | "mixed";
  dominantScript: string;
  dominantShare: number;
  /** Human-readable provenance that NAMES the threshold policy (US3 / FR-006). */
  provenance: string;
}

/**
 * Classify the base's script posture under the trust policy. Lowering the
 * threshold reclassifies a "mixed" base to "single-script" (and the provenance
 * names the threshold that decided it); raising it does the reverse. Pure.
 */
export function classifyBaseScript(
  evidence: AdaptationEvidence,
  policy: TrustPolicy,
): ScriptClassification {
  const [dominantScript, dominantShare] = dominantEntry(evidence.baseScriptDistribution);
  const posture = dominantShare >= policy.singleScriptThreshold ? "single-script" : "mixed";
  const pct = Math.round(policy.singleScriptThreshold * 100);
  const sharePct = Math.round(dominantShare * 100);
  const provenance =
    posture === "single-script"
      ? `${dominantScript} is ${sharePct}% of base rules, at or above the single-script threshold (${pct}%)`
      : `no script reaches the single-script threshold (${pct}%)`;
  return { posture, dominantScript, dominantShare, provenance };
}

/** A firing predicate: does this question fire, and what is its prefill value. */
type Predicate = (
  evidence: AdaptationEvidence,
  policy: TrustPolicy,
) => { fires: boolean; prefilledValue: string | null };

// Script-alignment predicates (US1). The `firingCondition` strings in the
// catalog records document these exactly.
const PREDICATES: Record<string, Predicate> = {
  // "sibling-script-spread > 1" — related keyboards exist in more than one script.
  q_sa1_target_script_spread: (evidence) => ({
    fires: Object.keys(evidence.siblingScriptSpread).length > 1,
    prefilledValue: evidence.targetScript,
  }),

  // "dominant-script-disagreement OR base-script == mixed".
  q_sa2_base_script_mismatch: (evidence, policy) => {
    const cls = classifyBaseScript(evidence, policy);
    const disagreement = cls.dominantScript !== "" && cls.dominantScript !== evidence.targetScript;
    return { fires: cls.posture === "mixed" || disagreement, prefilledValue: evidence.targetScript };
  },

  // "target == Latn AND latin-subprofile-disagreement" — the base carries a
  // non-plain Latin sub-profile that the target start would not assume.
  q_sa3_latin_flavor: (evidence) => {
    const fires =
      evidence.targetScript === "Latn" &&
      evidence.latinSubProfile !== null &&
      evidence.latinSubProfile !== "plain";
    return { fires, prefilledValue: evidence.latinSubProfile };
  },
};

/**
 * Evaluate the catalog against the evidence + policy. Returns only questions
 * whose firingCondition holds. A fallback-tier base with prefill disallowed
 * yields `prefilledValue: null` — never a silent drop (contract guarantee).
 */
export function evaluateFiringConditions(
  evidence: AdaptationEvidence,
  policy: TrustPolicy,
  catalog: QuestionRecord[] = adaptationCatalog,
): FiredQuestion[] {
  const fallbackDisallowed =
    evidence.provenanceTier === "language-default" && !policy.allowFallbackTierPrefill;

  const fired: FiredQuestion[] = [];
  for (const rec of catalog) {
    const predicate = PREDICATES[rec.id];
    if (predicate === undefined) continue; // posture / policy families handled elsewhere
    const { fires, prefilledValue } = predicate(evidence, policy);
    if (!fires) continue;
    fired.push({
      id: rec.id,
      prefilledValue: fallbackDisallowed ? null : prefilledValue,
      provenanceLabel: rec.provenanceLabel,
      provenanceTier: evidence.provenanceTier,
    });
  }
  return fired;
}

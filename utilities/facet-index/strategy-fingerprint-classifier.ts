/**
 * Strategy-fingerprint classifier (spec 037 US2, T018/T019) — rule-structure
 * archetype. Fingerprints a keyboard by the spec-§7 input-method strategies its
 * rules realize, as a prevalence distribution over recognized `StrategyId`s,
 * plus a DISTINCT unrecognized-`residue` share.
 *
 * Two independent axes, deliberately not conflated (data-model Entity 3b):
 *   - `analyzedCoverage` = parse-opacity: how much of the source the codec could
 *     model at all (`1 - opaqueShare`) — the SAME definition the script facet
 *     uses (via `computeAnalyzedCoverage`), so it means the same thing across
 *     classifiers.
 *   - `residue` = recognizer-gap: of the rules the parser DID model, the share
 *     matching no recognized strategy (`1 - recognizedRatio`). A fully-parsed
 *     keyboard using an unrecognized strategy has `analyzedCoverage ≈ 1` and a
 *     high `residue`.
 *
 * `residue` is a first-class field, never a distribution key (037 FR-012): the
 * facet never presents partial recognition as full coverage. As of classifier
 * v1 the recognizer covers S-01 (simple swap) and S-02 (deadkey single-tap);
 * everything else lands in `residue`.
 *
 * Stability (FR-013): the fingerprint is a function of the PARSED rule
 * structure, so comment/whitespace-only edits to a `.kmn` leave it unchanged.
 */

import type { KeyboardIR } from "@keyboard-studio/contracts";
import { ImportStatus } from "@keyboard-studio/contracts";

import { mapImportStatus, computeAnalyzedCoverage } from "./outcome.js";
import { CONFIDENT_DOMINANT_SHARE, strategyRuleTally } from "./strategy-tally.js";
import type { Categorization, ConfidenceClass, FacetDefinition } from "./types.js";
import type { ScannedKeyboard } from "./scan.js";

/** Residue at or above this share means recognition is too partial to call a dominant strategy `confident`. */
const CONFIDENT_MAX_RESIDUE = 0.2;
/** Float tolerance so a distribution that sums to a hair over 1 does not trip the sum invariant. */
const EPSILON = 1e-9;

/**
 * Content-derived strategy fingerprint, or `null` when there is nothing to
 * fingerprint (no rules at all) — the caller falls through to
 * `strategyFingerprintFallback`. Never divides by zero.
 */
export function classifyStrategyFingerprint(ir: KeyboardIR, def: FacetDefinition): Categorization | null {
  void def; // every key emitted is a StrategyId within limits by construction (recognizer output).

  const totalRules = ir.groups.reduce((sum, g) => sum + g.rules.length, 0);
  if (totalRules === 0) return null; // no rule population to fingerprint — fall through.

  // Precondition: `ir.recognizedPatterns` is already populated. The build runs
  // `recognizePatterns` ONCE, centrally, in `buildKeyboardRecord` before the
  // classifier loop (build-index.ts) — recognizing there keeps the shared IR's
  // mutation explicit and out of any classifier's body, and avoids recomputing
  // recognition across the full corpus on every build. We re-derive the
  // recognized share from the owned-rule tally below so the distribution +
  // residue sum is numerically exact for the build-time X2 check.

  // Per-strategy owned-rule tally (shared with primary-strategy — see
  // strategy-tally.ts). Each recognized rule is owned by exactly one pattern
  // (ownership-consistency invariant), so summing per-pattern owned-rule counts
  // grouped by strategy never double-counts a rule.
  const strategyRuleCount = strategyRuleTally(ir);

  const distribution: Record<string, number> = {};
  let recognizedShare = 0;
  for (const strategyId of [...strategyRuleCount.keys()].sort()) {
    const share = strategyRuleCount.get(strategyId)! / totalRules;
    distribution[strategyId] = share;
    recognizedShare += share;
  }
  // residue = recognizer-gap. Derived from the same tally so distribution + residue == 1 exactly.
  const residue = Math.max(0, 1 - recognizedShare);

  // Dominant recognized strategy (highest share; lexicographic tie-break for
  // determinism). Omitted when residue dominates or nothing was recognized.
  let dominant: string | undefined;
  let dominantShare = 0;
  for (const strategyId of Object.keys(distribution)) {
    const share = distribution[strategyId]!;
    if (share > dominantShare + EPSILON) {
      dominant = strategyId;
      dominantShare = share;
    }
  }
  const residueDominates = residue > dominantShare + EPSILON;
  const value = dominant !== undefined && !residueDominates ? dominant : undefined;

  const status = ir.raw.length > 0 ? ImportStatus.CleanWithOpaque : ImportStatus.Clean;

  return {
    value,
    distribution,
    confidence: null, // the distribution carries the likelihood
    confidenceClass: classifyConfidence(dominantShare, residue),
    provenanceTier: "content-derived",
    evidenceSize: totalRules,
    analyzedCoverage: computeAnalyzedCoverage(ir),
    analysisOutcome: mapImportStatus(status),
    residue,
    notes: "recognizer covers S-01/S-02 as of strategy-fingerprint v1; other strategies land in residue",
  };
}

/**
 * Fallback for the strategy fingerprint: reached only when there is no rule
 * population to analyze (zero rules) or `parse()` threw. There is no declared-
 * metadata tier for this facet (research D7) — a fingerprint cannot be inferred
 * from package metadata — so the fallback is an honest "undetermined": value
 * omitted (no out-of-limits sentinel — see strategy-fingerprint.yaml), no
 * fabricated distribution or residue, and `analysisOutcome: 'fallback-only'`.
 */
export function strategyFingerprintFallback(kb: ScannedKeyboard, def: FacetDefinition): Categorization {
  void kb;
  void def;
  const confidenceClass: ConfidenceClass = "undetermined";
  return {
    value: undefined,
    confidence: null,
    confidenceClass,
    provenanceTier: "default-fallback",
    evidenceSize: 0,
    analyzedCoverage: 0,
    analysisOutcome: "fallback-only",
    notes: "no recognizable rule structure (no rules or parse failure); strategy fingerprint undetermined",
  };
}

/**
 * `confident` when a single strategy holds ≥80% of the recognized share and the
 * unrecognized residue is low (≤20%); `undetermined` when nothing was
 * recognized; `mixed` otherwise (strategies split, or recognition too partial).
 */
function classifyConfidence(dominantShare: number, residue: number): ConfidenceClass {
  if (dominantShare === 0) return "undetermined";
  if (dominantShare >= CONFIDENT_DOMINANT_SHARE && residue <= CONFIDENT_MAX_RESIDUE) return "confident";
  return "mixed";
}

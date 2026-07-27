/**
 * Primary-strategy classifier (spec 043 US1, T010) — rule-structure archetype.
 *
 * The base's OWN dominant spec-§7 input-method strategy: the mode (arg-max) of
 * the per-keyboard owned-rule tally over recognized `StrategyId`s. This is the
 * same tally `strategy-fingerprint-classifier.ts` builds before it aggregates
 * into a distribution — here we take its arg-max instead (research Decision 3).
 *
 * Distinct from `lineage.strategy-fingerprint`: the fingerprint is the full
 * prevalence distribution (a neighborhood-comparable shape); `primary-strategy`
 * is the single dominant value a selector ranks a base by (SC-006). A TIE across
 * two or more strategies at the top count is recorded HONESTLY as `mixed` with
 * the tied set in `notes` — never silently resolved (FR-010).
 *
 * The recognizer covers S-01/S-02 as of today; a base whose dominant strategy is
 * unrecognized has no owned-rule tally, so `classify` returns null and the base
 * falls through to the undetermined fallback rather than being forced to a value.
 */

import type { KeyboardIR } from "@keyboard-studio/contracts";

import { undeterminedFallback } from "./measurement.js";
import { computeAnalyzedCoverage } from "./outcome.js";
import { CONFIDENT_DOMINANT_SHARE, strategyRuleTally } from "./strategy-tally.js";
import type { Categorization, ConfidenceClass, FacetDefinition } from "./types.js";
import type { ScannedKeyboard } from "./scan.js";

/** The honest tie value when two or more strategies share the top owned-rule count. */
const MIXED = "mixed";

/**
 * Content-derived primary strategy, or `null` when no rule is recognized as any
 * strategy (the caller falls through to `primaryStrategyFallback`). Never throws.
 */
export function classifyPrimaryStrategy(ir: KeyboardIR, def: FacetDefinition): Categorization | null {
  void def; // every emitted value is a StrategyId (recognizer output) or `mixed`, within limits by construction.

  const counts = strategyRuleTally(ir);
  if (counts.size === 0) return null; // nothing recognized — fall through.

  const recognizedTotal = [...counts.values()].reduce((sum, c) => sum + c, 0);
  const maxCount = Math.max(...counts.values());
  // Tied set at the top count, lexicographically sorted for determinism.
  const topStrategies = [...counts.keys()].filter((id) => counts.get(id) === maxCount).sort();

  const dominantShare = maxCount / recognizedTotal;
  const tie = topStrategies.length > 1;
  const value = tie ? MIXED : topStrategies[0]!;

  const confidenceClass: ConfidenceClass = tie
    ? "mixed"
    : dominantShare >= CONFIDENT_DOMINANT_SHARE
      ? "confident"
      : "mixed";

  const notes = tie
    ? `tie across ${topStrategies.join(", ")} at ${maxCount} owned rule(s) each; recorded as mixed (recognizer covers S-01/S-02 as of v1)`
    : `dominant of ${counts.size} recognized strateg${counts.size === 1 ? "y" : "ies"}; recognizer covers S-01/S-02 as of v1`;

  return {
    value,
    confidence: null, // consistency carries the likelihood for the single dominant value
    confidenceClass,
    provenanceTier: "content-derived",
    evidenceSize: recognizedTotal,
    analyzedCoverage: computeAnalyzedCoverage(ir),
    analysisOutcome: ir.raw.length > 0 ? "partially" : "fully",
    consistency: dominantShare,
    notes,
  };
}

/**
 * Fallback: reached when nothing was recognized (no rules, or every rule fell in
 * the recognizer residue) or `parse()` threw. There is no declared-metadata tier
 * for a strategy fingerprint (research Decision 3 / spec 037 D7) — package
 * metadata cannot name a strategy — so this is an honest `undetermined`.
 */
export function primaryStrategyFallback(kb: ScannedKeyboard, def: FacetDefinition): Categorization {
  void kb;
  void def;
  return undeterminedFallback("no recognized strategy (no rules, parse failure, or dominant strategy in residue); primary strategy undetermined");
}

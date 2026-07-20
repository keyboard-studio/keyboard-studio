/**
 * Shared per-keyboard owned-rule tally over recognized spec-§7 strategies
 * (spec 043 T010 review-fix — extracted from `primary-strategy-classifier.ts`
 * and `strategy-fingerprint-classifier.ts`, which each built this same tally).
 *
 * Both the strategy fingerprint (the full prevalence distribution) and the
 * primary strategy (the arg-max of the distribution) start from this one tally,
 * so it has a single home rather than two verbatim copies.
 */

import type { KeyboardIR } from "@keyboard-studio/contracts";

/** A single strategy must reach this share of RECOGNIZED rules to read as `confident`. */
export const CONFIDENT_DOMINANT_SHARE = 0.8;

/**
 * The per-keyboard owned-rule tally over recognized strategies. Each recognized
 * rule is owned by exactly one pattern (ownership-consistency invariant), so
 * summing per-pattern owned-rule counts grouped by strategy never double-counts.
 * `recognizePatterns` has already run centrally in `buildKeyboardRecord`, so
 * `ir.recognizedPatterns` is populated before any classifier reads it.
 */
export function strategyRuleTally(ir: KeyboardIR): Map<string, number> {
  const counts = new Map<string, number>();
  for (const pattern of ir.recognizedPatterns) {
    const strategyId = pattern.strategyId;
    if (strategyId === undefined) continue;
    const owned = (pattern.ownedNodes ?? []).filter((n) => n.kind === "rule").length;
    if (owned === 0) continue;
    counts.set(strategyId, (counts.get(strategyId) ?? 0) + owned);
  }
  return counts;
}

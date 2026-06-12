// selectStrategy() — §7.2 decision tree implementation.

import type {
  DiscoveryAxisVector,
  StrategyRecommendation,
  StrategyId,
  PrimaryRuleNumber,
} from "@keyboard-studio/contracts";

/**
 * Run the §7.2 decision tree against a fully-computed discovery axis vector
 * and return a strategy recommendation with a primary strategy, zero or more
 * secondary strategies, and the rule number that fired.
 *
 * Firing order:
 *   Pass 1 — primary-fixing (rules 1–8, then 11, then 12 fallback).
 *             First match wins; sets `primary` and `triggeredRule`.
 *   S-11 wrapper — if a rule OTHER than rule 4 fires as primary AND
 *             `axes.multiMode === "two-orthography"`, S-11 is pushed to
 *             secondaries before Pass 2.
 *   Pass 2 — secondary-adding (always runs):
 *             rule 9 → push S-10 if `constraintEnforcement === "loud"`.
 *             rule 10 → push S-08 if `spareKeyAvailability === "fully booked"`.
 *
 * Deduplication preserves first-appearance order.
 *
 * @see spec.md §7.2
 */
export function selectStrategy(axes: DiscoveryAxisVector): StrategyRecommendation {
  const secondaries: StrategyId[] = [];
  let primary: StrategyId;
  let triggeredRule: PrimaryRuleNumber;

  // ------------------------------------------------------------------
  // Pass 1 — primary-fixing
  // ------------------------------------------------------------------

  if (axes.scale === "massive" && axes.scriptClass === "logographic") {
    // Rule 1
    primary = "S-12";
    triggeredRule = 1;
  } else if (
    axes.scriptClass === "abjad" ||
    (axes.scriptClass === "abugida" && axes.clusterSensitivity === true)
  ) {
    // Rule 2
    primary = "S-09";
    triggeredRule = 2;
    if (axes.phoneticIntuition === "strong") {
      secondaries.push("S-05");
    }
  } else if (axes.diacriticBehavior === "replacing-cycling") {
    // Rule 3
    primary = "S-07";
    triggeredRule = 3;
    secondaries.push("S-04");
  } else if (axes.multiMode === "two-orthography") {
    // Rule 4
    primary = "S-11";
    triggeredRule = 4;
  } else if (
    axes.phoneticIntuition === "strong" &&
    (axes.scale === "medium" || axes.scale === "large")
  ) {
    // Rule 5
    primary = "S-05";
    triggeredRule = 5;
    secondaries.push("S-04");
  } else if (axes.diacriticBehavior === "multi-family" && axes.scale === "large") {
    // Rule 6
    primary = "S-06";
    triggeredRule = 6;
    secondaries.push("S-04");
  } else if (
    axes.diacriticBehavior === "stacking-combining" &&
    (axes.scale === "small" || axes.scale === "medium")
  ) {
    // Rule 7
    primary = "S-02";
    triggeredRule = 7;
    secondaries.push("S-04");
  } else if (axes.scriptClass === "alphabetic" && axes.remapPosture === "full-remap") {
    // Rule 8
    primary = "S-06";
    triggeredRule = 8;
    secondaries.push("S-04");
    secondaries.push("S-08");
  } else if (axes.scale === "tiny" && axes.phoneticIntuition === "strong") {
    // Rule 11
    primary = "S-01";
    triggeredRule = 11;
  } else {
    // Rule 12 — fallback
    primary = "S-03";
    triggeredRule = 12;
  }

  // ------------------------------------------------------------------
  // S-11 wrapper — if rule 4 did NOT fire as primary but multiMode is
  // "two-orthography", push S-11 as a secondary (wrapper behavior).
  // ------------------------------------------------------------------
  if (triggeredRule !== 4 && axes.multiMode === "two-orthography") {
    secondaries.push("S-11");
  }

  // ------------------------------------------------------------------
  // Pass 2 — secondary-adding (always runs)
  // ------------------------------------------------------------------

  // Rule 9 — constraintEnforcement === "loud" → add S-10
  if (axes.constraintEnforcement === "loud") {
    secondaries.push("S-10");
  }

  // Rule 10 — spareKeyAvailability === "fully booked" → add S-08
  if (axes.spareKeyAvailability === "fully booked") {
    secondaries.push("S-08");
  }

  // ------------------------------------------------------------------
  // Deduplication — preserve first-appearance order
  // ------------------------------------------------------------------
  const seen = new Set<StrategyId>();
  const deduped: StrategyId[] = [];
  for (const s of secondaries) {
    if (!seen.has(s)) {
      seen.add(s);
      deduped.push(s);
    }
  }

  return { primary, secondaries: deduped, triggeredRule };
}

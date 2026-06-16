// selectStrategy() — §7.2 decision tree implementation.
//
// The decision tree itself lives as data in ./rules.ts (PRIMARY_RULES +
// SECONDARY_RULES) so it can be both executed here and rendered by the studio's
// developer Flow Map. This function is a thin interpreter over those tables.

import type {
  DiscoveryAxisVector,
  StrategyRecommendation,
  StrategyId,
} from "@keyboard-studio/contracts";
import { PRIMARY_RULES, SECONDARY_RULES } from "./rules.js";

/**
 * Run the §7.2 decision tree against a fully-computed discovery axis vector
 * and return a strategy recommendation with a primary strategy, zero or more
 * secondary strategies, and the rule number that fired.
 *
 * Firing order:
 *   Pass 1 — primary-fixing: the first {@link PRIMARY_RULES} entry whose
 *             predicate matches sets `primary` and `triggeredRule`, and appends
 *             its (possibly conditional) per-rule secondaries. Rule 12 is the
 *             always-true fallback and is last in the table.
 *   Pass 2 — secondary-adding: {@link SECONDARY_RULES} run in order — the S-11
 *             wrapper (NON-rule-4 primary under a two-orthography keyboard),
 *             then rule 9 (loud → S-10) and rule 10 (fully booked → S-08).
 *
 * Deduplication preserves first-appearance order.
 *
 * @see spec.md §7.2
 * @see ./rules.ts — the data tables this interprets
 */
export function selectStrategy(axes: DiscoveryAxisVector): StrategyRecommendation {
  // ------------------------------------------------------------------
  // Pass 1 — primary-fixing (first match wins; rule 12 always matches)
  // ------------------------------------------------------------------
  const matched = PRIMARY_RULES.find((r) => r.when(axes));
  if (matched === undefined) {
    // Unreachable: rule 12's predicate is always true. Guard for type safety.
    throw new Error("selectStrategy: no primary rule matched (missing fallback?)");
  }

  const primary = matched.primary;
  const triggeredRule = matched.rule;
  const secondaries: StrategyId[] = [];

  for (const sec of matched.secondaries) {
    if (sec.when === undefined || sec.when(axes)) {
      secondaries.push(sec.strategy);
    }
  }

  // ------------------------------------------------------------------
  // Pass 2 — secondary-adding (S-11 wrapper, then rules 9 and 10)
  // ------------------------------------------------------------------
  for (const sr of SECONDARY_RULES) {
    if (sr.when(axes, triggeredRule)) {
      secondaries.push(sr.add);
    }
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

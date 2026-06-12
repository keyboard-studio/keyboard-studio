// see spec.md section 7.3 - strategy catalog S-01..S-13

export type StrategyId =
  | "S-01"
  | "S-02"
  | "S-03"
  | "S-04"
  | "S-05"
  | "S-06"
  | "S-07"
  | "S-08"
  | "S-09"
  | "S-10"
  | "S-11"
  | "S-12"
  | "S-13";

export const ALL_STRATEGY_IDS: readonly StrategyId[] = [
  "S-01",
  "S-02",
  "S-03",
  "S-04",
  "S-05",
  "S-06",
  "S-07",
  "S-08",
  "S-09",
  "S-10",
  "S-11",
  "S-12",
  "S-13",
] as const;

/**
 * §7.2 decision tree rule numbers that can fire as the primary-strategy
 * selector. Rules 9 and 10 are excluded because they are secondaries-only:
 * rule 9 (`A6=loud`) adds S-10; rule 10 (`A7=fully-booked`) adds S-08;
 * neither sets the `primary` field of a {@link StrategyRecommendation}.
 *
 * Valid set: 1-8 (rules 1-7 + rule 8 alphabetic-full-remap), the string "3a"
 * (rule 3a — A3a=postfix intercept, fires between rules 3 and 4), and 11-12
 * (rule 11 = `A1=tiny AND A3=strong → S-01`; rule 12 = catch-all fallback to S-03).
 *
 * @see spec.md §7.2
 */
export type PrimaryRuleNumber = 1 | 2 | 3 | "3a" | 4 | 5 | 6 | 7 | 8 | 11 | 12;

/** Output of the strategy selector - see spec.md section 7.2 decision tree. */
export interface StrategyRecommendation {
  primary: StrategyId;
  /**
   * Secondaries in first-appearance order: (1) primary-specific "combines well with"
   * entries from the §7.2 per-rule table (e.g. S-05 for rule 2, S-04 for rules 3/5–8),
   * (2) S-11 wrapper if A5=two-orthography and rule 4 did not fire as primary,
   * (3) rule-9 addition (S-10) if A6=loud, (4) rule-10 addition (S-08) if A7=fully booked.
   * No duplicates — each strategy appears at most once in this list.
   */
  secondaries: StrategyId[];
  /**
   * Which §7.2 rule fired to pick the primary. Restricted to
   * {@link PrimaryRuleNumber} — rules 9 and 10 are secondaries-only and can
   * never appear here.
   */
  triggeredRule: PrimaryRuleNumber;
}

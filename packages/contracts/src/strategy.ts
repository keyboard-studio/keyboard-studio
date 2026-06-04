// see spec.md section 7.3 - strategy catalog S-01..S-12

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
  | "S-12";

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
] as const;

/**
 * §7.2 decision tree rule numbers that can fire as the primary-strategy
 * selector. Rules 9 and 10 are excluded because they are secondaries-only:
 * rule 9 (`A6=loud`) adds S-10; rule 10 (`A7=fully-booked`) adds S-08;
 * neither sets the `primary` field of a {@link StrategyRecommendation}.
 *
 * Valid set: 1-8 (rules 1-7 + rule 8 alphabetic-full-remap) and 11-12
 * (rule 11 = `A1=tiny AND A3=strong → S-01`; rule 12 = catch-all fallback to S-03).
 *
 * @see spec.md §7.2
 */
export type PrimaryRuleNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 11 | 12;

/** Output of the strategy selector - see spec.md section 7.2 decision tree. */
export interface StrategyRecommendation {
  primary: StrategyId;
  /**
   * Secondaries added by §7.2 rules 9-10 plus any primary's "Combines well with"
   * list. Order matches rule firing: rule-9 secondaries (S-10) appear before
   * rule-10 secondaries (S-08), with primary-specific "combines well with"
   * entries appended after. No duplicates — each strategy appears at most
   * once in this list.
   */
  secondaries: StrategyId[];
  /**
   * Which §7.2 rule fired to pick the primary. Restricted to
   * {@link PrimaryRuleNumber} — rules 9 and 10 are secondaries-only and can
   * never appear here.
   */
  triggeredRule: PrimaryRuleNumber;
}

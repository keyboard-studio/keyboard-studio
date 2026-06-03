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
  /** Which numbered rule in section 7.2 fired to pick the primary (1..12). */
  triggeredRule: number;
}

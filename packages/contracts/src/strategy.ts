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
  secondaries: StrategyId[];
  /** Which numbered rule in section 7.2 fired to pick the primary (1..12). */
  triggeredRule: number;
}

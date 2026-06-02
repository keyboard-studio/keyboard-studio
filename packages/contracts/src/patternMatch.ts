// see spec.md section 8 phase C - gallery surfacing

import type { StrategyId } from "./strategy";

export type PatternMatchReason =
  | "primary-strategy"
  | "secondary-strategy"
  | "appliesTo-match"
  | "user-expanded";

export interface PatternMatch {
  patternId: string;
  /**
   * Optional. Set once the strategy selector resolves a match; absent during
   * pre-resolution candidate enumeration.
   */
  strategyId?: StrategyId;
  /** 1 = top of gallery; ascending. */
  rank: number;
  reason: PatternMatchReason;
  /** Optional numeric score (higher = better fit). */
  score?: number;
}

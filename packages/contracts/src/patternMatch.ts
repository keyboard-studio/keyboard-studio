// see spec.md section 8 phase C - gallery surfacing

import type { StrategyId } from "./strategy";
import type { Pattern } from "./pattern";

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

/**
 * Build a PatternMatch from a Pattern, rank, and reason.
 *
 * Shared helper used by the engine's filterFor.ts and the browser's
 * browserPatternLibrary.ts to avoid duplicating the four-line struct-build.
 * If `p.strategyId` is set it is forwarded onto the match; otherwise the
 * field is omitted (exactOptionalPropertyTypes safe).
 */
export function toPatternMatch(
  p: Pattern,
  rank: number,
  reason: PatternMatchReason,
): PatternMatch {
  return {
    patternId: p.id,
    rank,
    reason,
    ...(p.strategyId !== undefined ? { strategyId: p.strategyId } : {}),
  };
}

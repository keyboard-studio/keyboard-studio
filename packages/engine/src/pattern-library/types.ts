import type { LintFinding, PatternCategory } from "@keyboard-studio/contracts";

/**
 * Filter parameters for {@link getPatterns}.
 * All fields are optional; only patterns matching ALL provided fields are returned.
 */
export interface PatternFilter {
  /** Include only patterns with this group_visibility value (or "all"). */
  group_visibility?: string;
  /** Include only patterns with this category. */
  category?: PatternCategory | string;
  /** Include only patterns with this priority value. */
  priority?: number;
}

/**
 * Summary of a {@link loadPatterns} run.
 * Failures are collected here instead of thrown so callers can inspect them.
 */
export interface LoadReport {
  /** Number of patterns that passed schema validation and were loaded. */
  loaded: number;
  /** Files that were skipped due to parse or schema validation failure. */
  skipped: Array<{ file: string; reason: string }>;
  /**
   * Patterns that loaded successfully but whose demo.filled_kmn contains
   * Layer A errors. These are included in the cache but flagged for review.
   */
  flagged: Array<{ patternId: string; findings: LintFinding[] }>;
}

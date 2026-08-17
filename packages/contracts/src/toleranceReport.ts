// see specs/062-canonical-context-tolerance/spec.md - canonical-equivalence
// context tolerance. Contracts-only data: the engine-side both-forms
// simulator comparison (packages/engine/src/validator/context-tolerance.ts)
// produces this shape; packages/keyboard-lint consumes it as a precomputed
// input without importing the engine (lint-not-to-engine).

import type { SourceLocation } from "./lintFinding";
import type { SimKeyInput } from "./simulation";

/**
 * Per-rule diagnosis produced by the both-forms simulator comparison.
 *
 * - `"tolerant"` — the rule already fires identically regardless of which
 *   canonical form the context holds. Terminal; never touched again.
 * - `"made-tolerant"` — a gap was diagnosed and a generated context variant
 *   has been confirmed for this rule.
 * - `"not-analysed"` — no verdict could be reached: either the rule contains
 *   an opaque construct the codec could not model, or it is backed by a
 *   store whose `index()` pairing makes decomposed-member insertion unsafe.
 *   Terminal until a generated variant transitions it to `"made-tolerant"`.
 */
export type ToleranceStatus = "tolerant" | "made-tolerant" | "not-analysed";

/** One rule's canonical-equivalence diagnosis. */
export interface RuleToleranceFinding {
  ruleId: string;
  location: SourceLocation;
  status: ToleranceStatus;
  /**
   * The concrete failing keystroke sequence — present only when a gap was
   * found (before a fix was generated). This is the reproducible case
   * spec 062 Story 2 requires.
   */
  failingKeystrokes?: SimKeyInput[];
  /**
   * The two observed outputs that differed. Raw codepoints only — naming
   * them by codepoint + Unicode name (FR-012) is a rendering concern for the
   * consumer, not stored here.
   */
  precomposedOutput?: string;
  decomposedOutput?: string;
  /**
   * Present only when `status === "not-analysed"` — e.g. "rule contains an
   * opaque construct" or "store paired via index() with a different store".
   */
  notAnalysedReason?: string;
}

/**
 * The full both-forms diagnostic for one keyboard.
 *
 * **Validation rule (SC-006)**: `findings.length + notAnalysedCount` MUST
 * equal the keyboard's total rule count — every rule lands in exactly one
 * bucket, never silently omitted. A report failing this invariant is a bug
 * in the producer, not a valid "clean" result.
 */
export interface ToleranceReport {
  /** One entry per rule the codec could model. */
  findings: RuleToleranceFinding[];
  /**
   * Rules skipped because they are opaque (`RawKmnFragment`), tracked
   * separately so the SC-006 invariant is checkable without re-deriving it
   * from `findings`.
   */
  notAnalysedCount: number;
}

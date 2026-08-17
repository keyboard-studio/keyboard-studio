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

/**
 * A proposed IR mutation that makes one rule canonically-equivalence
 * tolerant — never applied without confirmation (FR-009).
 *
 * Producer: `packages/engine/src/pattern-apply/context-variants.ts`.
 */
export interface ContextVariant {
  /** The rule this variant makes tolerant. */
  sourceRuleId: string;
  /** Which mutation shape was used. Only `"added-rule"` is generated today — see the producer's module doc. */
  kind: "added-rule" | "added-store-members";
  /**
   * The idempotency name-prefix checked before insertion — a re-run
   * recognizes and replaces rather than duplicates (FR-011).
   */
  generatedMarker: string;
  /**
   * Set when the source rule has an existing unaccompanied-key fallback
   * (spec Story 1 Acceptance Scenario 3) — the placement invariant the
   * generator must honor so the tolerant rule wins over the fallback.
   */
  precedesFallbackRuleId?: string;
  /**
   * The exact output the keyboard's own (untouched) rule already produces
   * for the precomposed form of this context — the "keyboard's own form"
   * FR-007's `"own-form"` write-back setting normalizes to. The generated
   * rule itself defaults to this value's canonical-equivalence-preserving
   * NFD form (`"echo"`, FR-007's default); a write-back policy switch
   * (spec 062 US3) rewrites it back to this value without recompiling.
   *
   * Absent for a variant with no per-candidate output string in this sense
   * — spec 062 US4's backspace-unwrap variants (`kind: "added-rule"`, but a
   * store-`index()` or per-unit literal output, never a single candidate's
   * echo/own-form choice) have no write-back setting of their own. Producers
   * and consumers must check for `undefined` rather than treat a missing
   * value as an empty string.
   */
  precomposedOutput?: string;
}

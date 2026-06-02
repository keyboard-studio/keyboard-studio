// see spec.md section 5 - Pattern schema (Day-1 contract)

import type { StrategyId } from "./strategy";

export type PatternCategory = "desktop" | "touch" | "reorder";

export type AnswerType =
  | "char-list" // user pastes or types a list of Unicode characters
  | "char-single" // user types or picks a single Unicode character
  | "key-name" // user picks a virtual-key name (K_A, K_SEMICOLON, etc.)
  | "store-content" // user provides a quoted store body string
  | "boolean" // yes / no
  | "select" // one of a fixed set of labeled options
  | "text"; // free-form plain-language answer (LLM maps to slot)

export interface PatternQuestion {
  /** Stable identifier referenced in kmnFragment placeholders. */
  id: string;
  /** Plain-language prompt shown to the user. */
  prompt: string;
  answerType: AnswerType;
  /** For "select" type: the available options. */
  options?: Array<{ value: string; label: string }>;
  /** Default value pre-filled when the base keyboard suggests one. */
  default?: string;
}

export interface TestVector {
  /** Key sequence to simulate, as an array of virtual-key strings. */
  input: string[];
  /** Expected Unicode output string after processing. */
  expectedOutput: string;
  /** Optional human description of what this vector tests. */
  description?: string;
}

export interface Pattern {
  /** Stable, snake_case, globally unique. Example: "latin_deadkey_acute". */
  id: string;
  /** Short human-readable name shown in the gallery. */
  title: string;
  /** One or two sentences explaining the pattern in plain language. */
  description: string;
  /** Which gallery the pattern lives in. */
  category: PatternCategory;
  /**
   * Restricts which projects this pattern is offered to.
   * BCP47 script subtags (e.g. "Deva", "Arab") or base-keyboard IDs.
   * Empty array means unrestricted: the pattern is offered to all groups.
   * Non-empty array restricts the pattern to the listed script subtags
   * or base-keyboard IDs.
   */
  appliesTo: string[];
  /**
   * The strategy card (S-01..S-12, spec section 7.3) this pattern implements.
   * The strategy selector uses this to map a decision-tree result to the
   * pattern(s) the gallery should surface.
   * @see spec.md §5, §7.3
   */
  strategyId?: StrategyId;
  /**
   * Secondary strategy cards this pattern commonly combines with (e.g. ["S-04"]).
   * Mirrors the "Combines well with" line on each strategy card (section 7.3) and the
   * "+ secondaries" output of the decision tree (section 7.2).
   * @see spec.md §5, §7.3
   */
  combinesWith?: StrategyId[];
  /** Survey questions that fill the named slots in kmnFragment. */
  questions: PatternQuestion[];
  /**
   * KMN rule fragment with {{slotId}} placeholders.
   * Must be syntactically valid KMN when slots are filled.
   * May span multiple rule lines and store declarations.
   */
  kmnFragment: string;
  /**
   * Touch-layout JSON fragment (partial keyman-touch-layout structure).
   * Present for touch-category patterns and desktop patterns that imply
   * a touch counterpart (e.g. longpress menu from a deadkey).
   * Uses the same {{slotId}} placeholder convention.
   */
  touchLayoutFragment?: string;
  /**
   * KMN reorder group fragment.
   * Present for reorder-category patterns.
   * Uses the same {{slotId}} placeholder convention.
   */
  reorderRules?: string;
  /**
   * Round-trip test vectors.
   * Must pass the Layer A validator and the WASM oracle after slot substitution
   * before the pattern is admitted to the library.
   */
  tests: TestVector[];
  /** Script families for which this pattern has been validated. */
  validatedForFamilies: string[];
  /** Source keyboards from keymanapp/keyboards/release/ used during mining. */
  sourceKeyboards: string[];
  /** Human reviewer who approved this pattern for the library. */
  reviewedBy: string;
  /** ISO date of review. Format: YYYY-MM-DD. */
  reviewDate: string;
}

/**
 * Input shape for `makePattern`. Mirrors `Pattern` but all optional fields
 * may be omitted cleanly without fighting `exactOptionalPropertyTypes`.
 */
export type PatternInit = {
  id: string;
  title: string;
  description: string;
  category: PatternCategory;
  appliesTo: string[];
  strategyId?: StrategyId;
  combinesWith?: StrategyId[];
  questions: PatternQuestion[];
  kmnFragment: string;
  touchLayoutFragment?: string;
  reorderRules?: string;
  tests: TestVector[];
  validatedForFamilies: string[];
  sourceKeyboards: string[];
  reviewedBy: string;
  reviewDate: string;
};

/**
 * Construct a `Pattern` from a `PatternInit`, stripping any `undefined`-valued
 * optional keys so the result is a clean `Pattern` value.
 */
export function makePattern(init: PatternInit): Pattern {
  const result: Record<string, unknown> = {
    id: init.id,
    title: init.title,
    description: init.description,
    category: init.category,
    appliesTo: init.appliesTo,
    questions: init.questions,
    kmnFragment: init.kmnFragment,
    tests: init.tests,
    validatedForFamilies: init.validatedForFamilies,
    sourceKeyboards: init.sourceKeyboards,
    reviewedBy: init.reviewedBy,
    reviewDate: init.reviewDate,
  };
  if (init.strategyId !== undefined) result["strategyId"] = init.strategyId;
  if (init.combinesWith !== undefined) result["combinesWith"] = init.combinesWith;
  if (init.touchLayoutFragment !== undefined)
    result["touchLayoutFragment"] = init.touchLayoutFragment;
  if (init.reorderRules !== undefined) result["reorderRules"] = init.reorderRules;
  return result as unknown as Pattern;
}

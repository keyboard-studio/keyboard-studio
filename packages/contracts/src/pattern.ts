// Pattern schema — the Day-1 contract. THIS interface is canonical.
// Prose spec: specs/005-pattern-schema/spec.md (spec.md §5 is a stub pointer).
// Runtime mirror + data-file validation: ./schemas.ts (zod; bound to this file
// by compile-time drift guards — edit a field here and its schema there in the
// same change, or the build fails).

import type { StrategyId } from "./strategy";
import type { IRNodeRef } from "./keyboard-ir";

/** Structured demo object as stored in content YAML files. */
export interface DemoObject {
  filled_kmn?: string | null;
  touch_layout_fragment?: string | null;
  sample_keys?: string[] | null;
  sample_output?: string[] | null;
}

/**
 * Gallery categories a pattern can belong to.
 * The three spec §5 values (desktop, touch, reorder) are the engine-canonical
 * routing categories. The remaining values (substitute, transliteration, ime,
 * validation) are the actual directory names used in the content/patterns YAML
 * tree and must be accepted by the loader and the gallery.
 */
export type PatternCategory =
  | "desktop"
  | "touch"
  | "reorder"
  | "substitute"
  | "transliteration"
  | "ime"
  | "validation";

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
  /**
   * Statically-known default. The live default may instead be derived per session
   * (base, corpus, axis fill, CLDR/identity) and carry its own provenance; optionality is a
   * static-slot vs. runtime-fill split, not licence to ask blank (spec §3c / §5 "Base-derived pre-fill").
   */
  default?: string;
  /**
   * Whether this slot must be filled before a Pattern can be applied.
   *
   * - `required: true` (or field omitted — defaults to true) — the validator
   *   blocks submission when the slot is empty post-substitution
   *   (spec §14 Decision 1).
   * - `required: false` — the substituted fragment is allowed to leave this
   *   slot empty IF the result still passes Layer A validation
   *   (spec §14 Decision 1 explicit carve-out for "optional slot").
   *
   * The validator adjudicates mechanically using this field; no heuristic
   * or LLM judgment is involved. Omitting the field implies `required: true`
   * (the safe default — every slot is required unless explicitly marked
   * optional).
   *
   * @see spec.md §14 Decision 1
   */
  required?: boolean;
}

export interface TestVector {
  /**
   * Key sequence to simulate. Each element must be a Keyman virtual-key string:
   *   K_XXXX  — named virtual key (e.g. "K_A", "K_QUOTE")
   *   U_XXXX  — Unicode virtual key (hex codepoint, uppercase, 4-6 digits; e.g. "U_0915")
   * U+XXXX (Unicode codepoint literal syntax) is NOT valid here; use U_XXXX instead.
   */
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
  /**
   * Where this Pattern instance came from.
   *   'survey'      — author selected it from the gallery (existing v1 behaviour).
   *   'imported'    — round-tripped as opaque IR; not survey-editable in v1
   *                   (rendered in the carve gallery as a deletable card).
   *   'recognized'  — the pattern recognizer lifted node clusters from an
   *                   imported IR into this Pattern; survey-editable via {{slotId}} flow.
   * Default: 'survey' (omitted means survey-originated).
   * @see spec.md §5a — KeyboardIR; pending ratification at #232 joint session.
   */
  origin?: "survey" | "imported" | "recognized";
  /**
   * IR nodes this Pattern owns. Populated by the pattern recognizer for
   * origin='recognized' patterns. Back-references let the emitter know which IR
   * nodes to overwrite when a slot is edited, and let the carve gallery know
   * which IR cards to suppress (already represented by the parent Pattern card).
   * Empty/omitted for origin='survey'.
   * @see spec.md §5a — IRNodeRef; pending ratification at #232 joint session.
   */
  ownedNodes?: IRNodeRef[];
  /**
   * True when the author has manually edited slots on a recognized Pattern.
   * Distinguishes an untouched recognized pattern (safe to re-derive on re-import)
   * from one the author has overridden (must be treated as authoritative on re-emit).
   * Default false / omitted. Only meaningful when origin='recognized'.
   * @see spec.md §5a — recognized-then-edited semantics; ratified at #232.
   */
  authorModified?: boolean;
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
  /** Frequency of this pattern in corpus data (optional numeric indicator). */
  frequencyInCorpus?: number;

  // Content-layer fields — present in YAML source files; may be stripped by loader before engine use.

  /**
   * Source keyboards with example rules that demonstrate this pattern.
   * Each entry names a keyboard path and optionally a specific rule excerpt
   * and explanatory notes.
   * content-layer only; loader may omit when constructing engine Pattern objects.
   */
  provenance?: Array<{
    keyboard: string;
    rule?: string;
    notes?: string;
  }>;

  /**
   * Structured demo object covering the four sub-fields present in content
   * YAML files. The loader passes this through as-is; the engine may extract
   * `filled_kmn` for compilation. See also the `string` union member for
   * legacy single-string demos.
   */
  demo?: string | DemoObject | null;

  /**
   * Gallery visibility scope for this pattern.
   * "all" means the pattern is shown to all user groups; other values restrict
   * the pattern to the named group (e.g. a language-family group ID).
   * Present in YAML source files; used by the pattern-library loader filter.
   */
  group_visibility?: string;

  /**
   * Ordering priority within the gallery (lower number = higher priority).
   * Used by the pattern-library loader's PatternFilter to select patterns
   * at a specific priority tier.
   */
  priority?: number;
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
  origin?: "survey" | "imported" | "recognized";
  ownedNodes?: IRNodeRef[];
  authorModified?: boolean;
  questions: PatternQuestion[];
  kmnFragment: string;
  touchLayoutFragment?: string;
  reorderRules?: string;
  tests: TestVector[];
  validatedForFamilies: string[];
  sourceKeyboards: string[];
  reviewedBy: string;
  reviewDate: string;
  frequencyInCorpus?: number;
  provenance?: Array<{
    keyboard: string;
    rule?: string;
    notes?: string;
  }>;
  demo?: string | DemoObject | null;
  /** @see Pattern.group_visibility */
  group_visibility?: string;
  /** @see Pattern.priority */
  priority?: number;
};

/**
 * Construct a `Pattern` from a `PatternInit`, stripping any `undefined`-valued
 * optional keys so the result is a clean `Pattern` value.
 */
export function makePattern(init: PatternInit): Pattern {
  return {
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
    ...(init.strategyId !== undefined ? { strategyId: init.strategyId } : {}),
    ...(init.combinesWith !== undefined ? { combinesWith: init.combinesWith } : {}),
    ...(init.origin !== undefined ? { origin: init.origin } : {}),
    ...(init.ownedNodes !== undefined ? { ownedNodes: init.ownedNodes } : {}),
    ...(init.authorModified !== undefined ? { authorModified: init.authorModified } : {}),
    ...(init.touchLayoutFragment !== undefined
      ? { touchLayoutFragment: init.touchLayoutFragment }
      : {}),
    ...(init.reorderRules !== undefined ? { reorderRules: init.reorderRules } : {}),
    ...(init.frequencyInCorpus !== undefined ? { frequencyInCorpus: init.frequencyInCorpus } : {}),
    ...(init.provenance !== undefined ? { provenance: init.provenance } : {}),
    ...(init.demo !== undefined ? { demo: init.demo } : {}),
    ...(init.group_visibility !== undefined ? { group_visibility: init.group_visibility } : {}),
    ...(init.priority !== undefined ? { priority: init.priority } : {}),
  };
}

# Feature spec — Pattern schema (spec.md §5)

> **Status:** authoritative for §5. Extracted from monolithic `spec.md` on 2026-06-16 as the third section of the section-by-section spec-kit migration (after §7, §8). The root `spec.md` contains only a stub pointer to this file. On conflict, this file wins — **except** that the canonical `Pattern` type is the TypeScript interface in [`packages/contracts/src/pattern.ts`](../../packages/contracts/src/pattern.ts), runtime-enforced by the zod schemas in [`packages/contracts/src/schemas.ts`](../../packages/contracts/src/schemas.ts). This prose is the **Day-1 reference**; the code carries non-breaking optional extensions beyond what is shown here (e.g. the broader `PatternCategory` union, `DemoObject`, `authorModified`, `group_visibility`, `priority`). The type is the tiebreaker; this section is the contract's intent and lock policy.
>
> **Cross-references** to other sections (e.g. "Sec 7", "§5a", "Sec 18", "§3c") still resolve against the monolithic `spec.md`. Internal `{{slotId}}` / field references resolve within this file.
>
> **Locked contract (constitution Principle I, spec §18).** Field renames, type changes, or removals require a **major `@keyboard-studio/contracts` version bump + a joint engine+content session** — not a single-reviewer prose edit. Because the type is now mirrored by a zod schema, editing a locked field also means editing its schema in the same change: the `schemas.ts` drift guards fail the build otherwise. A plan that proposes editing the schema MUST stop and escalate.
>
> **Grilling status:** `/speckit-clarify` not run. The Pattern schema is the locked Day-1 contract (#5); this extraction is relocation, not re-specification. Any future clarification must go through the joint-session gate above, not an inline clarify pass.

## 5. Pattern schema

*Revised 2026-06-08 (v1.1.0 KeyboardIR import). See [docs/spec-amendment-2026-06-08-keyboardir.md](../../docs/spec-amendment-2026-06-08-keyboardir.md).*

This schema is the Day-1 contract. Any change to field names or types requires a joint session (issue #5). Breaking changes to the `Pattern` interface require a major version bump (see Sec 18). The optional `strategyId` and `combinesWith` fields are **proposed** additions that link each pattern to the strategy catalog (Sec 7); they are non-breaking (optional) but, per the same policy, are not locked until the Day-1 #5 session ratifies them.

The optional `origin` and `ownedNodes` fields are non-breaking additions that link a Pattern instance back to the imported IR it was lifted from; see §5a. They are ratified in the same Day-1 #5 session that ratifies `strategyId` / `combinesWith`.

```ts
/** Canonical Pattern schema — packages/contracts/src/pattern.ts */

export type PatternCategory = "desktop" | "touch" | "reorder";

export type AnswerType =
  | "char-list"      // user pastes or types a list of Unicode characters
  | "char-single"    // user types or picks a single Unicode character
  | "key-name"       // user picks a virtual-key name (K_A, K_SEMICOLON, etc.)
  | "store-content"  // user provides a quoted store body string
  | "boolean"        // yes / no
  | "select"         // one of a fixed set of labeled options
  | "text";          // free-form plain-language answer (LLM maps to slot)

export interface PatternQuestion {
  /** Stable identifier referenced in kmnFragment placeholders. */
  id: string;
  /** Plain-language prompt shown to the user. */
  prompt: string;
  answerType: AnswerType;
  /** For "select" type: the available options. */
  options?: Array<{ value: string; label: string }>;
  /** Statically-known default. The live default may instead be derived per session
   *  (base, corpus §7.6, axis fill §7.1, CLDR/identity) with its own provenance;
   *  optionality is a static-slot vs. runtime-fill split, not licence to ask blank (§3c). */
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
   * The strategy card (S-01..S-12, Sec 7.3) this pattern implements.
   * The strategy selector uses this to map a decision-tree result to the
   * pattern(s) the gallery should surface.
   * @see spec.md §5, §7.3
   */
  strategyId?: StrategyId;
  /**
   * Pattern-author-declared partner strategies — the "Combines well with"
   * line on the pattern's strategy card (Sec 7.3). These are STRUCTURAL
   * pairings the pattern author endorses (e.g. S-02 deadkey patterns
   * usually pair with S-04 parallel-store lookup).
   *
   * This field is NOT the same as `StrategyRecommendation.secondaries`
   * from the §7.2 decision tree, which are AXIS-CONDITIONAL secondaries
   * added at recommendation time (rules 9/10: + S-10 on A6=loud,
   * + S-08 on A7=fully-booked). The gallery's full secondary set for a
   * given (recommendation, pattern) pair is the union of the two.
   * @see spec.md §5, §7.3
   * @see Sec 7.2 — `StrategyRecommendation.secondaries` (axis-conditional)
   */
  combinesWith?: StrategyId[];
  /**
   * Where this Pattern instance came from.
   *   'survey'      — author selected it from the gallery (existing v1 behaviour).
   *   'imported'    — round-tripped as opaque IR; not survey-editable in v1
   *                   (rendered in the carve gallery as a deletable card).
   *   'recognized'  — the pattern recognizer lifted node clusters from an
   *                   imported IR into this Pattern instance; survey-editable
   *                   via the standard {{slotId}} substitution flow.
   * Default: 'survey' (omitted means survey-originated).
   */
  origin?: "survey" | "imported" | "recognized";
  /**
   * IR nodes this Pattern owns. Populated by the pattern recognizer for
   * origin='recognized' patterns; back-references let the emitter know
   * which IR nodes to overwrite when the survey edits a slot, and let the
   * carve gallery know which IR cards to suppress (because they are
   * already represented by their parent Pattern card).
   * Empty/omitted for origin='survey'.
   * @see §5a KeyboardIR — IRNodeRef
   */
  ownedNodes?: IRNodeRef[];
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
   * content-layer only; loader may omit when constructing engine Pattern objects.
   */
  provenance?: Array<{ keyboard: string; rule?: string; notes?: string }>;

  /**
   * A demonstration KMN snippet or description string showing the pattern in action.
   * content-layer only; loader may omit when constructing engine Pattern objects.
   */
  demo?: string | null;
}
```

`StrategyId` is the union `'S-01' | 'S-02' | ... | 'S-12'` exported from `@keyboard-studio/contracts`; see §7.3 for the strategy catalog.

**`appliesTo` semantics.** An empty array (`[]`) means the pattern is unrestricted and will be offered to all script groups. A non-empty array lists BCP47 script subtags (e.g. `"Latn"`, `"Deva"`) or base-keyboard IDs; the pattern is then offered only to projects matching at least one listed value.

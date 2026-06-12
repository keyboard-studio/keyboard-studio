# keyboard-studio — Spec

**Repository:** https://github.com/MattGyverLee/keyboard-studio
**Date:** 2026-06-09
**Version:** 1.1.1
**Status:** Draft — pre-Day-1 sync

---

## Table of Contents

1. [Elevator pitch](#1-elevator-pitch)
2. [Why this exists](#2-why-this-exists)
3. [Target user](#3-target-user)
4. [System overview](#4-system-overview)
5. [Pattern schema](#5-pattern-schema)
5a. [KeyboardIR (keyboard intermediate representation)](#5a-keyboardir-keyboard-intermediate-representation)
6. [Worked example](#6-worked-example)
7. [Strategy selection](#7-strategy-selection)
8. [Data flow](#8-data-flow)
9. [Three-group routing](#9-three-group-routing)
10. [Validator and lint engine](#10-validator-and-lint-engine)
11. [criteria.md compliance](#11-criteriamd-compliance)
12. [Output artifacts](#12-output-artifacts)
13. [Team boundaries](#13-team-boundaries)
14. [Open questions — resolved decisions](#14-open-questions--resolved-decisions)
15. [Acceptance scenarios](#15-acceptance-scenarios)
16. [Out of scope](#16-out-of-scope)
17. [Glossary](#17-glossary)
18. [Revision policy](#18-revision-policy)
19. [Reference](#19-reference)

---

## 1. Elevator pitch

*Revised 2026-06-08 (v1.1.0 KeyboardIR import). See [docs/spec-amendment-2026-06-08-keyboardir.md](docs/spec-amendment-2026-06-08-keyboardir.md).*

**Problem.** Language experts who want to submit a keyboard to `keymanapp/keyboards` must either learn `.kmn` syntax themselves or find a Keyman Developer-fluent collaborator. Most language workers cannot ship without external help; keyboard repository reviewers spend significant time correcting the same mechanical hygiene mistakes across dozens of PRs.

**Solution.** Keyboard-Studio is a browser-based authoring environment that lets language experts — people who know their language's phonology, orthography, and character inventory but have never written a Keyman keyboard — produce production-ready Keyman keyboards without touching `.kmn` syntax. Every session adapts a **single** base keyboard: the US-English fallback (the default when the user has no existing layout to start from), any `release/basic/` layout, any other `keymanapp/keyboards/release/` keyboard (e.g. a country keyboard the user wants to subset for one language), or an uploaded `.kmn`. Users answer plain-language questions, carve away rules they do not want from the imported base, and choose from live-demoed interaction patterns to add new behaviour. The system compiles in-browser in 100-300 ms per edit using the existing `kmcmplib` WebAssembly (WASM) binary, validates every emission against a real language-aware lint engine, scaffolds a touch layout automatically from desktop rules, and enforces all mechanical criteria by construction.

**Delivery.** A finished keyboard is delivered either as a downloadable `.zip` or via GitHub Open Authorization (OAuth) fork-and-draft-PR directly to `keymanapp/keyboards`.

---

## 2. Why this exists

*Revised 2026-06-08 (v1.1.0 KeyboardIR import). See [docs/spec-amendment-2026-06-08-keyboardir.md](docs/spec-amendment-2026-06-08-keyboardir.md).*

Language experts who want to submit a keyboard to `keymanapp/keyboards` today face every one of these barriers:

- Writing `.kmn` rules requires knowledge of virtual-key names, store declarations, deadkey syntax, group structure, and modifier semantics.
- A complete submission requires producing and keeping consistent: `.kpj`, `.kps`, `.kvks`, `.keyman-touch-layout`, `HISTORY.md`, `LICENSE.md`, `README.md`, `welcome.htm`, and `help/<name>.php`.
- Generating a touch layout from desktop rules is a manual, error-prone step.
- Satisfying the ~200 PR-review criteria in `criteria.md` requires both domain knowledge and Keyman-specific familiarity.
- In practice, reviewers silently fix the same hygiene mistakes across dozens of PRs: missing `usealtgr` tag, wrong `Copyright ©` syntax, `NCAPS` leftovers, blank `.kvks`, `welcome.htm`/`.php` body drift.
- Existing keyboards in `release/` cannot be adapted without re-authoring by hand: a maintainer who wants to take a multilingual country keyboard (e.g. `cm_qwerty`) and ship a monolingual subset for one language has no path short of hand-editing `.kmn`. Original authors updating their own keyboards face the same friction.

Keyboard-Studio removes every mechanical barrier: the scaffolder enforces all green criteria by construction, the survey surfaces yellow criteria in plain language, and the validator blocks invalid output before it ever reaches the compiler. The same machinery serves authors adapting an existing keyboard: the studio parses the chosen `.kmn` into a typed in-memory representation, lets the author carve unwanted rules away and add new ones through the same survey, and re-emits a functionally-equivalent `.kmn`.

---

## 3. Target user

*Revised 2026-06-08 (v1.1.0 KeyboardIR import). See [docs/spec-amendment-2026-06-08-keyboardir.md](docs/spec-amendment-2026-06-08-keyboardir.md).*

A **language expert, not a keyboard developer.** They understand phonology, orthography, casing rules, diacritic stacking behavior, and the characters their language needs. They do not have a mental model of what a deadkey, longpress menu, rota, multitap, or flick is as a keyboard implementation — even if they intuitively recognize the behaviors when demonstrated.

What they have:
- Knowledge of their language's character inventory and how those characters behave (combining order, casing, script direction).
- A BCP47 language tag (or enough information to look one up).
- A browser and a GitHub account (optional for download path).

What they do not have:
- Familiarity with `.kmn` syntax, virtual-key names, store declarations, or group-and-rule structure.
- A Keyman Developer installation.
- Any expectation of reading compiler diagnostic messages in their raw form.

The studio teaches keyboard interaction patterns through live mini-keyboards the user can tap and type into, translating their linguistic intent into validated KMN rules.

A secondary user-mode the studio explicitly supports: an **adapting author** who is starting from an existing `release/` keyboard rather than from the US-English base. They may be a community member taking a country-wide keyboard down to a single language, or an original author returning to update their own keyboard. They have the same linguistic knowledge as the primary user; what they additionally have is an existing `.kmn` they want to keep most of. The studio's import path treats this case as the same authoring flow — only the source of the initial in-memory project differs.

---

## 4. System overview

*Revised 2026-06-08 (v1.1.0 KeyboardIR import). See [docs/spec-amendment-2026-06-08-keyboardir.md](docs/spec-amendment-2026-06-08-keyboardir.md).*

```
keyboard-studio
|
+-- source selection           [engine]   Picks ONE source: US-English fallback (default),
|                                         release/basic/* layout, any release/ keyboard, or
|                                         user-uploaded .kmn. No multi-keyboard merge.
|
+-- KeyboardIR codec           [engine]   Parses the chosen .kmn (+ .kvks, .keyman-touch-layout)
|                                         into the typed KeyboardIR (§5a). Emits IR back to
|                                         .kmn at output time. Round-trip is functional-equivalence
|                                         verified (D7, §14).
|
+-- pattern recognizer         [engine/content]
|                                         Walks the imported IR and lifts node clusters matching
|                                         content-curated recognizer rules into Pattern instances
|                                         (origin: 'recognized'). Lifted nodes become
|                                         survey-editable; unlifted nodes stay opaque (D8).
|
+-- carve gallery              [engine]   Renders the IR as a card view: every rule, store, group,
|                                         touch key, and recognized Pattern is a card the author can
|                                         keep, edit (if survey-editable), or delete. Carve operations
|                                         mutate the IR in place.
|
+-- project scaffolder         [engine]   Applies identity propagation (keyboard name, BCP47 tag,
|                                         copyright, version) to the IR; runs template-cleanup over
|                                         the IR (NCAPS strip, [CAPS] deletion, &CasedKeys insertion,
|                                         touch-layout cleanup); enforces clean-by-construction
|                                         before the authoring engine sees the project.
|
+-- authoring engine           [engine/content]
|   +-- survey                            Eight-phase branching questionnaire (A, B, C, C-prime, D, E, F, G — see §8); LLM maps answers to
|   |                                     slot values and to the seven discovery axes (Sec 7);
|   |                                     plain-language throughout.
|   +-- strategy selector       [engine/content]
|   |                                     Consumes the discovery axes; runs the decision tree
|   |                                     (Sec 7) to pick a primary output strategy (S-01..S-12)
|   |                                     plus secondaries; ranks which patterns the gallery shows.
|   +-- gallery                           Show-by-example mini-keyboards; surfaces the selected
|                                         strategy's patterns first; user taps and picks; each
|                                         entry is a validated KMN skeleton with named slots.
|
+-- pattern-library loader     [content]  Parameterized, human-reviewed KMN skeletons for desktop,
|                                         touch, and reorder interactions; each tagged with the
|                                         strategy card (Sec 7) it implements; mined from release/,
|                                         curated, slot-parameterized, test-vector-verified.
|
+-- studio UI shell            [engine]   Two-pane SPA; survey left, live preview right; phase
|                                         navigation; lint chip display; submit/download buttons.
|
+-- live preview pane          [engine]   KeymanWeb embed; OSK + textarea; debounce 300 ms; compiler
|                                         warnings surface as lint chips; blocks Submit on any warn.
|
+-- validator / lint engine    [engine]   Three layers: Layer A validity (TS + WASM oracle),
|                                         Layer B style (TS AST rules), Layer C hygiene (criteria.md).
|                                         Packaged as @keymanapp/kmn-validator + @keymanapp/keyboard-lint.
|                                         Also includes the new Layer A' import-fidelity checks I1-I5
|                                         (§10) that run on every codec parse and on output emission.
|
+-- compiler service (WASM)    [engine]   kmcmplib loaded once; warm recompile 100-300 ms; produces
|                                         .kmx + .kvk + .js + .keyman-touch-layout blob URLs.
|
+-- output / submit            [engine]   Download .zip (no auth) OR GitHub OAuth fork+draft PR
                                          (PR body auto-generated from lint results).
```

---

## 5. Pattern schema

*Revised 2026-06-08 (v1.1.0 KeyboardIR import). See [docs/spec-amendment-2026-06-08-keyboardir.md](docs/spec-amendment-2026-06-08-keyboardir.md).*

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

---

## 5a. KeyboardIR (keyboard intermediate representation)

*Added 2026-06-08 (v1.1.0 KeyboardIR import). See [docs/spec-amendment-2026-06-08-keyboardir.md](docs/spec-amendment-2026-06-08-keyboardir.md).*

KeyboardIR is the typed, in-memory representation of a single Keyman keyboard — a lossless model of a `.kmn` plus its sibling `.kvks` and `.keyman-touch-layout` files. **Once a project exists in the studio, the IR is the source of truth (decision D9):** the survey, carve gallery, validator, and scaffolder all read and mutate the IR; the emitter renders the final `.kmn` from the IR; no original-source text round-trips through the rest of the pipeline. The `.kmn.imported` sidecar is removed (decision D11); attribution is carried by the HISTORY.md "Adapted from" bullet and the PR-body attribution block (§12, D14).

The IR's schema is locked alongside the Pattern schema at the Day-1 #5 joint session; field renames, type changes, and removals are major version bumps of `packages/contracts` per the policy in §18.

```ts
/** packages/contracts/src/keyboard-ir.ts — sketch; full types live in the contracts package */

export type IROrigin = "scaffolded" | "imported" | "synthesized";

export interface IRNodeRef {
  kind: "rule" | "store" | "group" | "touchKey" | "kvksKey" | "comment" | "raw";
  nodeId: string;
}

export interface IRHeader {
  keyboardId: string;
  name: string;
  bcp47: string[];
  copyright: string;
  version: string;
  targets: string[];
  storeDirectives: string[];
}

export interface IRStore {
  nodeId: string;
  name: string;
  items: StoreItem[];
  isSystem: boolean;
}

export interface IRGroup {
  nodeId: string;
  name: string;
  usingKeys: boolean;
  rules: IRRule[];
  readonly: boolean;
}

export interface IRRule {
  nodeId: string;
  context: ContextElement[];
  output: OutputElement[];
  trailingComment?: string;
  ownedByPattern?: string;
}

export interface IRComment {
  nodeId: string;
  text: string;
  anchor: "leading" | "trailing" | "freestanding";
  anchorRef?: IRNodeRef;
}

export interface RawKmnFragment {
  nodeId: string;
  origin: "imported";
  sourceText: string;
  reason: string;
}

export interface TouchLayoutIR {
  platforms: Array<{
    id: "phone" | "tablet" | "desktop";
    font?: string;
    layers: Array<{
      id: string;
      rows: Array<{ keys: TouchKeyIR[] }>;
    }>;
  }>;
  /** Entry-array form rather than `Map` because `Map` is not JSON-serializable; the VirtualFS round-trip (spec §11) requires entry-array form. */
  nodeIds: Array<[string, IRNodeRef]>;
}

export interface KvksIR {
  kvksVersion?: string;
  kbdname?: string;
  layers: Array<{
    shift: string;
    keys: Array<{
      vkey: string;
      label: string;
      chars?: string;
    }>;
  }>;
  usealtgr: boolean;
  /** Entry-array form rather than `Map` because `Map` is not JSON-serializable; the VirtualFS round-trip (spec §11) requires entry-array form. */
  nodeIds: Array<[string, IRNodeRef]>;
}

export interface KeyboardIR {
  origin: IROrigin;
  header: IRHeader;
  stores: IRStore[];
  groups: IRGroup[];
  comments: IRComment[];
  raw: RawKmnFragment[];
  touchLayout?: TouchLayoutIR;
  visualKeyboard?: KvksIR;
  recognizedPatterns: Pattern[];
}

export enum ImportStatus {
  Clean = "clean",
  CleanWithOpaque = "clean-with-opaque",
  ParseFailure = "parse-failure",
  RoundTripDivergence = "round-trip-divergence",
}

export interface ImportReport {
  keyboardId: string;
  status: ImportStatus;
  parseErrors: string[];
  opaqueFeatureInventory: Array<{ feature: string; count: number }>;
  recognizedRatio: number;
  roundTripDiff?: RoundTripDiff;
}
```

Detailed types — `ContextElement`, `OutputElement`, `KeyChord`, `StoreItem`, `TouchKeyIR`, `RoundTripDiff` — live in `packages/contracts/src/keyboard-ir.ts` alongside the sketch above.

**Functional-equivalence round-trip (D7).** Two IRs are equivalent when, for every input in a bounded enumeration corpus (every virtual key x every modifier combination x deadkey paths up to depth 3), the WASM oracle produces the same output character sequence from both. Byte-identity of emitted `.kmn` is not required; the emitter is free to canonicalize whitespace, store ordering, comment placement, and codepoint formatting.

**Sources of an IR.** A KeyboardIR is produced from exactly one of four sources, each routed through the same downstream pipeline:
1. The bundled US-English fallback (default when the author has no preference).
2. A `release/basic/*` layout chosen from the source-selection browser.
3. Any other `keymanapp/keyboards/release/` keyboard chosen from the browser (e.g. adapting `cm_qwerty` for one Cameroonian language).
4. A user-uploaded `.kmn` (plus optional sibling `.kvks` / `.keyman-touch-layout`).

v1 ships single-source adaptation only — there is no path that combines IRs from two source keyboards. An author adapting Bafut from three overlapping country keyboards picks the closest single one and carves it down.

**Gallery ranking when recognizer and decision tree disagree.** When an imported keyboard's recognizer-lifted Patterns carry `strategyId` values that differ from the decision tree's primary, the gallery ranks recognized Patterns whose `strategyId` matches the tree's primary *first*; recognized Patterns whose `strategyId` differs from the primary are surfaced as secondaries if they appear in the primary's `combinesWith` list, or in a distinct "From your import" section otherwise. The recognizer's `strategyId` claim is a post-hoc attribution; the tree's primary remains the authoritative strategy.

---

## 6. Worked example

The following YAML is the canonical record for the single-tap deadkey acute accent pattern, suitable for QWERTY/QWERTZ Latin keyboards.

```yaml
id: latin_deadkey_acute_single
title: "Tap, then a base letter, gives an accented version"
description: >
  A single apostrophe or backtick (the trigger key) followed by a base
  letter produces the precomposed accented form. Standard for French-style
  acute, grave, and circumflex input on QWERTY/QWERTZ layouts.
category: desktop
appliesTo: []   # empty = unrestricted; offered to all groups
strategyId: "S-02"        # Deadkey composition (Sec 7.3)
combinesWith: ["S-04"]    # parallel-store lookup collapses the post-deadkey table

questions:
  - id: triggerKey
    prompt: "Which key acts as the accent trigger? (e.g. the apostrophe key)"
    answerType: key-name
    default: "K_QUOTE"

  - id: accentChar
    prompt: "Which combining accent mark do you want? (e.g. U+0301 for acute)"
    answerType: char-single
    default: "́"

  - id: baseLetters
    prompt: >
      Which base letters take this accent? List them without spaces.
      Example: aeiouAEIOU
    answerType: char-list

  - id: accentedForms
    prompt: >
      List the accented forms in the same order as the base letters above.
      Example: áéíóúÁÉÍÓÚ
    answerType: char-list

kmnFragment: |
  store(dk_acute_bases)  '{{baseLetters}}'
  store(dk_acute_output) '{{accentedForms}}'

  + [{{triggerKey}}] > deadkey(acute)
  c Note: dk() is an alias for deadkey() and may appear in mined source patterns.

  deadkey(acute) + any(dk_acute_bases) > index(dk_acute_output, 2)
  c index(store, N) — N is the 1-based position of the matched any() in the
  c left-hand side. index() with a mismatched store length is a Layer A error.
  deadkey(acute) + [{{triggerKey}}] > '{{accentChar}}'

touchLayoutFragment: |
  {
    "sk": [
      { "id": "{{accentChar}}", "text": "{{accentChar}}" }
    ]
  }

reorderRules: null

tests:
  - input: ["K_QUOTE", "K_A"]
    expectedOutput: "á"
    description: "apostrophe + a produces a-acute (U+00E1)"
  - input: ["K_QUOTE", "K_E"]
    expectedOutput: "é"
    description: "apostrophe + e produces e-acute (U+00E9)"
  - input: ["K_QUOTE", "K_QUOTE"]
    expectedOutput: "́"
    description: "apostrophe + apostrophe produces combining acute alone"
  - input: ["K_A"]
    expectedOutput: "a"
    description: "plain a without deadkey produces a"

validatedForFamilies: ["Latn"]
sourceKeyboards:
  - "release/basic/basic_kbdfr"
  - "release/sil/sil_euro_latin"
reviewedBy: "keyboard-studio-content-team"
reviewDate: "2026-06-02"
```

### Placeholder substitution semantics

The scaffolder fills `{{slotId}}` placeholders in `kmnFragment`, `touchLayoutFragment`, and `reorderRules` using the answers collected from the pattern's `questions` array. Each question's `id` field is the placeholder name; the resolved value is the user's answer after LLM mapping.

For `char-list` answers, the value is inserted verbatim as a quoted KMN string literal (e.g. `'aeiou'`). For `key-name` answers, the value is inserted unquoted as a virtual-key identifier (e.g. `K_QUOTE`). For `char-single` answers, the value is inserted as a `U+XXXX` escape when outside the ASCII printable range, or as a quoted literal otherwise.

Substitution is deterministic and reproducible: given the same answer map, the same KMN fragment is always produced. After substitution the full fragment is run through the Layer A validator and the WASM oracle before being merged into the project's `.kmn`; a substitution-time validation failure is surfaced to the user as a slot-fill error, not a compiler error.

---

## 7. Strategy selection

*Revised 2026-06-08 (v1.1.0 KeyboardIR import). See [docs/spec-amendment-2026-06-08-keyboardir.md](docs/spec-amendment-2026-06-08-keyboardir.md).*
*Revised 2026-06-11 (v1.1.1 placement priors). See [docs/spec-amendment-2026-06-11-placement-priors.md](docs/spec-amendment-2026-06-11-placement-priors.md).*

Character coverage is **not** "simple substitution." Choosing how a character is output — a bare key swap, a deadkey-then-base composition, an ASCII transliteration, a tone cycle, a context-sensitive cluster, an OS IME callout — is the core decision the studio makes for the user. This section is that recommendation engine.

The survey does not emit output rules directly. It computes a seven-axis description of the keyboard's needs (Sec 7.1), runs a decision tree over those axes (Sec 7.2) to choose a **primary output strategy** (one of S-01..S-12) plus likely **secondaries**, and surfaces the matching gallery patterns for the user to confirm by example. The pattern library (Sec 5) is the implementation layer: each `Pattern` names the strategy it implements via `strategyId`, so a decision-tree result maps directly to the patterns the gallery shows first.

**Scope note.** The strategy catalog (Sec 7.3) describes **physical-keyboard (desktop) KMN rules**. Touch counterparts are produced from each pattern's `touchLayoutFragment` and Phase E (Sec 8); packaging from Phase G. The catalog is the desktop-rule layer of the fuller v1 pipeline — not a separate, narrower product. (The strategy framework was originally drafted physical-keyboard-only; in the studio it is embedded in the full touch + packaging flow.) v1 is desktop-first by design (Decision 6, Sec 14); touch-first authoring is a v1.1 candidate.

### 7.1 Discovery axes

Seven dimensions describe a keyboard-design need well enough to pick a strategy. Each is a value the **survey** computes — there is no separate interview script. The last column gives the survey phase that elicits the axis and the plain-language question used.

The axis vector is computed from the working IR (§5a), the patterns the recognizer has lifted from it, and the survey's confirmations. The survey augments the IR; it never substitutes for it. For a session starting from the US-English fallback the recognizer typically lifts no patterns and the axis vector comes almost entirely from survey answers; for a session adapting `sil_euro_latin` the recognizer lifts the deadkey families and the axis vector is largely pre-populated, with the survey confirming or correcting. The decision-tree firing order (§7.2) is unchanged.

| # | Axis | Allowed values | Meaning & survey elicitation |
|---|------|----------------|------------------------------|
| A1 | **Scale** | tiny (<5) / small (5–20) / medium (20–100) / large (100–300) / massive (1000+) | How many *new* characters the keyboard adds beyond a stock physical layout. **Phase B:** "Roughly how many new characters does your keyboard need — ones not already on a standard physical keyboard?" |
| A2 | **Script class** | alphabetic / abugida / abjad / syllabary / logographic | Structural class of the writing system; drives one-char-per-key vs. cluster-shaped output. **Phase A** (Three-group routing, Sec 9) detects this from the BCP47 script subtag + base; confirmed in plain language: "What writing system does the keyboard produce?" |
| A3 | **Phonetic intuition** | strong / weak | Strong = the user thinks "I'd type a Latin spelling of the sound." Weak = mapping is shape- or modifier-based. **Phase B/C:** "When you picture typing a special character — type the Latin spelling of the sound, or press a key that looks like it / a modifier + base key?" |
| A3a | **Mark-input order** | prefix / postfix | "prefix" = mark-then-letter; "postfix" = letter-then-mark. Gated on A2=alphabetic AND A3=strong. **Phase B:** "When typing a letter with a diacritic, does the typist expect to press the diacritic key before the letter, or type the letter first and then the diacritic?" |
| A4 | **Diacritic behavior** | none / stacking-combining / replacing-cycling / multi-family | How marks behave on a base. Cycling = a repeated mark key replaces the previous mark (Vietnamese-style). **Phase B/C:** "Do your characters have accent marks or tones — none, stacking, tone marks that replace on a second press, or many different accent families used together?" |
| A5 | **Multi-mode** | single / two-orthography | Whether the keyboard exposes a runtime toggle between two orthographic styles (e.g. dotted vs. bar-under Yoruba). **Phase A/C:** "Does your language have more than one written form users switch between?" |
| A6 | **Constraint enforcement** | none / soft / loud | What happens on an invalid sequence. Loud = audible beep; soft = silent suppression. **Phase C:** "Should the keyboard reject obviously invalid input — no, silently, or with a beep?" |
| A7 | **Spare-key availability** | many / RAlt only / fully booked | How crowded the base layout is; fully booked → need a modifier plane. **Phase B:** "What's the physical base layout, and does it have unused keys?" |

**A2a — cluster sensitivity (abugida/abjad only).** If A2 is abugida or abjad, one follow-up resolves whether output depends on prior context (Arabic positional forms, Indic reph/conjuncts, syllabary ligatures): "Does the keyboard need to choose different output based on what was typed before?" Yes → clusters needed; No → clusters not needed. The answer gates decision rule 2 (Sec 7.2).

**A7a — full-remap detection (alphabetic only).** If A2 is alphabetic, one follow-up resolves the keyboard's posture toward the base layout: "Will the keys on your keyboard mostly show the same letters as the base layout (with just a few additions or changes), or will every key display a different letter?" Full-remap → every key reassigned (Russian/Armenian/Greek mnemonic style); addition → most base keys unchanged (Akan-style additive layout). The answer gates the new decision rule 8 (Sec 7.2). For Latin-target alphabetic keyboards on a Latin base, the answer defaults to addition; non-Latin alphabetic targets on a Latin base (Cyrillic, Armenian, Greek, Coptic, Cherokee, Adlam, etc.) are the typical full-remap case.

**A3a — mark-input order (alphabetic only).** If A2=alphabetic and A3=strong, one follow-up resolves whether the community's mental model places the mark before or after the base letter: "When typing a letter with a diacritic, does the typist expect to press the diacritic key before the letter, or type the letter first and then the diacritic?" Prefix (mark-then-letter) → S-02 deadkey flow; postfix (letter-then-mark) → S-03 sequence-replace. This sub-axis closes the §7.5 IPA mismatch — IPA keyboard communities use postfix suffix sequences, not the mnemonic-spelling flow A3=strong would otherwise predict. When A3a=postfix and A4=stacking-combining both apply, rule 3a still fires (S-03 primary); implementations must emit base+combining mark in canonical NFC order to avoid normalization defects with stacking marks.

### 7.2 Decision tree

Ordered rules. The first matching rule fixes the **primary** strategy; rules 9–10 add **secondaries**; rule 11 is a late-primary fallback for tiny phonetic additions; rule 12 is the catch-all fallback.

| # | Condition | Primary | Add secondaries |
|---|-----------|---------|-----------------|
| 1 | A1=massive AND A2=logographic | **S-12** DLL IME callout | — |
| 2 | A2=abjad OR (A2=abugida AND cluster sensitivity=yes) | **S-09** Context-sensitive cluster | + S-05 if A3=strong |
| 3 | A4=replacing-cycling | **S-07** Diacritic cycle | + S-04 |
| 3a | A2=alphabetic AND A3=strong AND A3a=postfix | **S-03** Sequence replace | + S-04 |
| 4 | A5=two-orthography | **S-11** Stateful option toggle | (wraps whichever strategy fits the per-mode rules) |
| 5 | A3=strong AND A1 ∈ {medium, large} | **S-05** Mnemonic spelling | + S-04 |
| 6 | A4=multi-family AND A1=large | **S-06** Chained deadkeys (two-tier) | + S-04 |
| 7 | A4=stacking-combining AND A1 ∈ {small, medium} | **S-02** Deadkey composition | + S-04 |
| 8 | A2=alphabetic AND A7a=full-remap | **S-06** Chained deadkeys (alt-plane mnemonic) | + S-04, + S-08 |
| 9 | A6=loud | (whatever above) | + **S-10** Constraints + beep |
| 10 | A7=fully booked | (whatever above) | + **S-08** RAlt modifier-layer |
| 11 | A1=tiny AND A3=strong | **S-01** Simple swap | — |
| 12 | (fallback) | **S-03** Sequence replace | — |

**Firing order — important.** The table is numbered 1-12 but rules do NOT fire in raw 1→12 sequence. The actual order an implementation runs is:

1. **Primary-fixing pass.** Try rules 1, 2, 3, 3a, 4, 5, 6, 7, 8 in order (rule 3a, when A3a is elicited, intercepts postfix-preference keyboards before rules 5 and 7 can claim them); the first matching rule sets `primary`. If none of 1, 2, 3, 3a, 4, 5, 6, 7, 8 match, try rule 11 (`A1=tiny AND A3=strong`); if it matches, primary is S-01. Otherwise rule 12 (catch-all) sets primary to S-03.
2. **Secondary-adding pass.** Regardless of which primary was chosen, rules 9 (A6=loud → +S-10) and 10 (A7=fully-booked → +S-08) fire to APPEND axis-conditional secondaries to `StrategyRecommendation.secondaries`. These rules never set the primary — see {@link PrimaryRuleNumber} in `packages/contracts` which excludes 9 and 10 from valid `triggeredRule` values.

An implementation that walked the table top-to-bottom and halted on the first match would mis-categorize keyboards where rule 9 (A6=loud) fires before any 1-8 match — they'd be left with no primary. The Mermaid diagram below shows the correct flow (R1-R8 → R11 → R12 chain for primary, then `Sec → R9 → R10` for add-ons).

```mermaid
flowchart TD
    Start([Survey complete: axis vector ready]) --> R1{A1=massive AND<br/>A2=logographic?}
    R1 -- yes --> S12[/"<b>S-12</b> DLL IME callout"/]
    R1 -- no --> R2{A2=abjad OR<br/>(A2=abugida AND clusters needed)?}
    R2 -- yes --> S09[/"<b>S-09</b> Context-sensitive cluster<br/>+ S-05 if A3=strong"/]
    R2 -- no --> R3{A4=replacing-cycling?}
    R3 -- yes --> S07[/"<b>S-07</b> Diacritic cycle<br/>+ S-04"/]
    R3 -- no --> R3a{A2=alphabetic AND<br/>A3=strong AND<br/>A3a=postfix?}
    R3a -- yes --> S03a[/"<b>S-03</b> Sequence replace<br/>+ S-04 (postfix mental model)"/]
    R3a -- no --> R4{A5=two-orthography?}
    R4 -- yes --> S11[/"<b>S-11</b> Stateful option toggle<br/>(wraps inner strategy)"/]
    R4 -- no --> R5{A3=strong AND<br/>A1 in medium,large?}
    R5 -- yes --> S05[/"<b>S-05</b> Mnemonic spelling<br/>+ S-04"/]
    R5 -- no --> R6{A4=multi-family AND<br/>A1=large?}
    R6 -- yes --> S06[/"<b>S-06</b> Chained deadkeys<br/>+ S-04"/]
    R6 -- no --> R7{A4=stacking-combining AND<br/>A1 in small,medium?}
    R7 -- yes --> S02[/"<b>S-02</b> Deadkey composition<br/>+ S-04"/]
    R7 -- no --> R8{A2=alphabetic AND<br/>A7a=full-remap?}
    R8 -- yes --> S06full[/"<b>S-06</b> Chained deadkeys<br/>+ S-04, + S-08"/]
    R8 -- no --> R11{A1=tiny AND<br/>A3=strong?}
    R11 -- yes --> S01[/"<b>S-01</b> Simple swap"/]
    R11 -- no --> S03[/"<b>S-03</b> Sequence replace<br/>(fallback)"/]

    S12 --> Sec
    S09 --> Sec
    S07 --> Sec
    S03a --> Sec
    S11 --> Sec
    S05 --> Sec
    S06 --> Sec
    S06full --> Sec
    S02 --> Sec
    S01 --> Sec
    S03 --> Sec

    Sec{{"Add-on rules"}}
    Sec --> R9{A6=loud?}
    R9 -- yes --> Add10[/"+ S-10 Constraints + beep"/]
    R9 -- no --> R10
    Add10 --> R10{A7=fully booked?}
    R10 -- yes --> Add08[/"+ S-08 RAlt modifier-layer"/]
    R10 -- no --> Done([Recommendation set])
    Add08 --> Done

    classDef primary fill:#dde9ff,stroke:#3060c0,color:#000
    classDef addon fill:#fff2cc,stroke:#b58900,color:#000
    classDef decision fill:#f5f5f5,stroke:#666,color:#000
    class S01,S02,S03,S03a,S05,S06,S06full,S07,S09,S11,S12 primary
    class Add08,Add10 addon
    class R1,R2,R3,R3a,R4,R5,R6,R7,R8,R9,R10,R11,Sec decision
```

**Prose summary.** Massive logographic → only the OS IME is fast enough; delegate (S-12). Indic/Arabic-shaped scripts need context-aware cluster rules (S-09); phonetic ones add mnemonic spelling. Tonal cycling (S-07) is neither stacking nor deadkey. Dual orthography (S-11) wraps a state toggle around the inner strategy. Big phonetic alphabets (S-05) — let the user type spellings, collapsed with `any`/`index`. Big diacritic palettes (S-06) — two-tier deadkey: first key picks the family, second the base. Small accent-heavy Latin (S-02) — classic deadkey composition. Non-Latin alphabetic full-remap (Russian/Armenian/Greek mnemonic) — chained deadkeys for case-and-diacritic alternates (S-06) plus an RAlt modifier plane (S-08) for the lesser-used letters. Loud feedback (S-10) and fully-booked layouts (S-08) are add-ons, never the whole answer. A handful of phonetic additions (S-01) — just swap them in. Otherwise (S-03) — short ASCII sequences expand to single chars.

**Encoding.** The tree may be encoded as JSON/TS rules in `packages/contracts` or reasoned over by the LLM directly against this table; both are valid (pick per studio architecture). The strategy selector returns `{ primary: strategyId, secondaries: strategyId[] }`, which the gallery resolves to patterns via the `strategyId` / `combinesWith` fields (Sec 5).

**Touch keyboards and S-13.** The rules above are desktop-oriented — they model character-entry strategies driven by the A1–A7 axis vector. Touch keyboards need an additional structural choice: a dedicated layer-switch key that swaps the entire visible keyboard layout (default, shift, numeric, symbol, alt-script). This is not an A1–A7 character-entry strategy; it is a touch layout feature. Any touch keyboard with more than one named layer uses **S-13 Touch layer switch** as a structural wrapper alongside whichever character-entry strategy (S-01–S-09) governs the content of each layer. S-13 is chosen outside this decision tree, triggered by the presence of multiple entries in the touch layout's `"layer":` array.

### 7.3 Strategy catalog (S-01..S-13)

Each card is self-contained and citable by ID. Snippets are verbatim from `keymanapp/keyboards` (paths shown). The **Pattern mapping** line ties the card to the library: a pattern with that `strategyId` is what the gallery surfaces when the tree selects this strategy.

#### S-01 Simple swap

**When to use:** A1=tiny, A3=strong, A4=none. 1–5 extra characters mapping cleanly onto unused keys.
**When to avoid:** More than ~5 characters; any case where the new character should *combine* with prior input.
**Combines well with:** Nothing — one rule per character by definition.
**Pattern mapping:** `strategyId: "S-01"`; `combinesWith: []`.

```
store(&VERSION) '9.0'
begin Unicode > use(main)
group(main) using keys

+ [K_Q] > 'ɛ'
+ [SHIFT K_Q] > 'Ɛ'
```

**Real exemplar:** `release/a/akan/source/akan.kmn` — Akan (Twi/Fante) adds exactly `ɛ` and `ɔ` on the unused `q` and `c` keys.

#### S-02 Deadkey composition

**When to use:** A1 ∈ {small, medium}, A4=stacking-combining, A3=strong. User types a diacritic-naming key (`'`, `` ` ``, `:`) then a base letter.
**When to avoid:** When the diacritic should *replace* a previous one (S-07); when many families explode the table (S-06).
**Combines well with:** S-04 (collapse the post-deadkey table); S-08 (when the trigger needs RAlt); S-11 (when the keyboard toggles between orthographic variants at runtime).
**Pattern mapping:** `strategyId: "S-02"`; `combinesWith: ["S-04", "S-08", "S-11"]`. (This is the Sec 6 worked example, `latin_deadkey_acute_single`.)
**Placement semantics:** the trigger key is the placement decision. Prefer the key users already associate with the diacritic family (`'` acute, `` ` `` grave, `^` circumflex, `"` diaeresis, `~` tilde); when that key is occupied or absent on the base layout, fall back along the anchor cascade to nearby low-frequency punctuation. A corpus prior (Sec 7.6) overrides the default when independent same-script-class keyboards converge on a different trigger.

```
store(graveK) 'aeiouAEIOU'
store(graveO) 'àèìòùÀÈÌÒÙ'

+ '`' > dk(grave)
dk(grave) + any(graveK) > index(graveO, 2)
dk(grave) + any(keys)   > '`' context(2)    c restore on miss
```

**Real exemplar:** `release/sil/sil_euro_latin/source/sil_euro_latin.kmn` — 92 deadkey rules cover virtually every European Latin diacritic.

#### S-03 Sequence replace

**When to use:** A1 small to medium; user prefers short ASCII suffixes (`<`, `>`, `=`) to a deadkey flow. Common for IPA-style alphabets with no obvious "diacritic" key.
**When to avoid:** When the user must see intermediate state (deadkey commits nothing until the second key); sequences of more than 2–3 keys (S-05 is more legible).
**Combines well with:** S-04 (parallel lookup tables); S-05 (longer sequences in the same keyboard).
**Pattern mapping:** `strategyId: "S-03"`; `combinesWith: ["S-04", "S-05"]`.

```
store(equalD) 'a' 'e' 'i' 'o'
store(equalU) U+1D43 U+1D49 U+1DD0 U+1D52    c superscript variants

any(equalD) + '=' > index(equalU, 1)
```

**Real exemplar:** `release/sil/sil_ipa/source/sil_ipa.kmn` — `<`, `=`, `>` modifiers attach to a preceding base letter.

#### S-04 Parallel-store lookup (`any` + `index`)

**When to use:** Any positional mapping table of more than ~6 entries. A **building block**, not usually a primary — it makes S-02/S-03/S-05/S-06 maintainable.
**When to avoid:** Sparse / non-positional mappings; define separate stores per subset instead of leaving gaps.
**Combines well with:** Everything except S-01 and S-12.
**Pattern mapping:** `strategyId: "S-04"`; offered only as a secondary (never a tree primary).

```
store(K_lc1)  "a"    "b"    "c"    "d"
store(lc1)    U+0251 U+0253 U+0188 U+0257

dk(family) + any(K_lc1) > index(lc1, 2)
```

**Real exemplar:** `release/sil/sil_pan_africa_mnemonic/source/sil_pan_africa_mnemonic.kmn`.

#### S-05 Mnemonic spelling / transliteration

**When to use:** A3=strong, A1 ∈ {medium, large}. User types an ASCII transliteration; common for IPA, ITRANS, Sanskrit, romanized Greek.
**When to avoid:** When the user doesn't know the romanization scheme (S-02/S-06 with visual deadkey feedback is gentler).
**Combines well with:** S-04, S-09 (script also needs cluster rules), S-11 (two romanization schemes).
**Pattern mapping:** `strategyId: "S-05"`; `combinesWith: ["S-04", "S-09", "S-11"]`.
**Placement semantics:** the key→character table *is* the placement. Seed it from the romanization scheme the community already knows (corpus priors from same-script transliteration keyboards, e.g. the ITRANS family); never invent a novel scheme when an established one exists. Case pairs must stay on one key (shift-pair consistency is a hard constraint).

```
+ "a"      > "अ"
"अ" + "a"  > "आ"        c second 'a' lengthens
+ "A"      > "आ"
```

**Real exemplar:** `release/itrans/itrans_devanagari_hindi/source/itrans_devanagari_hindi.kmn` — `saMskRRta` → `संस्कृत`.

#### S-06 Chained deadkeys (two-tier)

**When to use:** A4=multi-family AND A1=large; or alphabetic scripts where one base key has multiple legitimate outputs and the next key disambiguates. First key picks the *family*, second the *base*.
**When to avoid:** A single diacritic family (S-02 suffices); when the user can't predict the family key.
**Combines well with:** S-04 (essential for the per-family table), S-08 (RAlt to host the family keys), S-11 (when the keyboard toggles between orthographic variants at runtime).
**Pattern mapping:** `strategyId: "S-06"`; `combinesWith: ["S-04", "S-08", "S-11"]`.
**Placement semantics:** the first-tier *family* keys are the placement decision; second-tier base keys follow the base layout. Choose family keys the same way as S-02 triggers (diacritic-mnemonic punctuation first), hosting them on RAlt when the base plane is booked. The corpus prior (Sec 7.6) reports which family keys real S-06 keyboards chose for the same script class.

```
+ [K_LBRKT]                > dk(family_grave)
+ [SHIFT K_LBRKT]          > dk(family_acute)

dk(family_grave) + any(K_vowels) > index(grave_out, 2)
dk(family_acute) + any(K_vowels) > index(acute_out, 2)
```

**Real exemplar:** `release/a/armenian_mnemonic_r/source/armenian_mnemonic_r.kmn`; pan-African two-tier family selection in `release/sil/sil_pan_africa_mnemonic/source/sil_pan_africa_mnemonic.kmn`.

#### S-07 Diacritic cycle

**When to use:** A4=replacing-cycling. Tonal languages where the same mark key, pressed again, **replaces** the existing tone rather than stacking.
**When to avoid:** Genuinely stacked diacritics (S-02); when cycle order isn't obvious (use explicit tone keys).
**Combines well with:** S-04 (parallel stores per tone state), smart-backspace (Sec 7.4.A).
**Pattern mapping:** `strategyId: "S-07"`; `combinesWith: ["S-04"]`.
**Placement semantics:** the cycle key is pressed at very high frequency, so ergonomics outranks mnemonics here — prefer strong-finger, home-adjacent keys. Where an established convention exists (TELEX `s`/`f`/`r`/`x`/`j` for Vietnamese tones — context-guarded bindings: the tone rule fires only after a vowel, so plain consonant typing is unaffected), it is effectively mandatory; diverging from a community's existing cycle keys is an escalation, not a default.

```
store(vowels)       'aeiou'
store(vowels_sac)   'áéíóú'      c acute
store(vowels_huyen) 'àèìòù'      c grave

any(vowels)     + 's' > index(vowels_sac, 1)
any(vowels_sac) + 's' > index(vowels, 1) 's'      c second press cancels
any(vowels_sac) + 'f' > index(vowels_huyen, 1)    c f swaps acute → grave
```

**Real exemplar:** `release/v/vietnamese_telex/source/vietnamese_telex.kmn` — the canonical TELEX cycling pattern.

#### S-08 RAlt modifier-layer

**When to use:** A7=fully booked (or RAlt only). Always an **add-on** — a second plane of characters (symbols, currency, math, rare letters).
**When to avoid:** As a primary strategy. Discoverability is poor; on macOS, RAlt collides with Option-key shortcuts.
**Combines well with:** Every primary strategy.
**Pattern mapping:** `strategyId: "S-08"`; offered only as a secondary (rule 10).
**Placement semantics:** none of its own (intentionally — S-08 is an add-on layer, not a placement-driving strategy); character placement *within* the RAlt layer follows the primary strategy's semantics and the Sec 7.6 priors.

```
+ [RALT K_SLASH]   > U+0301
+ [RALT K_PERIOD]  > '·'
+ [RALT K_COMMA]   > '''
```

**Real exemplar:** `release/r/russian_mnemonic_r/source/russian_mnemonic_r.kmn`.

#### S-09 Context-sensitive cluster formation

**When to use:** A2 ∈ {abugida, abjad}. Output depends on prior input: Indic *reph*/conjuncts, Arabic hamza-bearing alif variants, positional forms.
**When to avoid:** Purely alphabetic Latin/Cyrillic (S-02 / S-05 are simpler).
**Combines well with:** S-05 (romanized input), S-04 (consonant/matra tables), smart-backspace (Sec 7.4.A).
**Pattern mapping:** `strategyId: "S-09"`; `combinesWith: ["S-05", "S-04"]`.
**Placement semantics:** allocate base-consonant slots first, on the phonetic grid the script community already uses (corpus priors from same-script keyboards dominate; shaping-engine and font expectations make divergence costly — see the precedence rule in Sec 7.6). Vowel signs / matras are secondary and ride post-base keys or deadkeys; cluster triggers (reph, halant) follow the script's established convention.

```
any(ConsonantsU) + "R" > U+0930 U+094D index(ConsonantsU, 1)
any(BaseLetter) + 'g' > index(BaseLetter_modified, 1)
```

**Real exemplar (abugida — Indic *reph*):** `release/sil/sil_devanagari_phonetic/source/sil_devanagari_phonetic.kmn`.
**Real exemplar (abjad — Arabic hamza):** `release/a/arabic_izza/source/arabic_izza.kmn`.

#### S-10 Constraints + beep

**When to use:** A6=loud. Clusters where users need active feedback that they typed something illegal (e.g. an acute on a consonant that can't take it).
**When to avoid:** When the invalid combination is rare (the constraint group adds overhead); when `beep` would annoy in long-form typing.
**Combines well with:** Every primary strategy — a separate `group(constraints)` invoked before `group(main)`.
**Pattern mapping:** `strategyId: "S-10"`; offered only as a secondary (rule 8).

```
begin Unicode > use(constraints)

group(constraints) using keys
any(nonBaseChar) + any(diacriticsKeys) > context beep
nomatch > use(main)

group(main) using keys
... real rules ...
```

**Real exemplar:** `release/el/el_pasifika/source/el_pasifika.kmn` — Polynesian Latin + macron/acute/diaeresis; beeps on invalid base+diacritic combinations.

#### S-11 Stateful option toggle

**When to use:** A5=two-orthography. One keyboard, two written conventions, runtime toggle (Yoruba dotted vs. barred, Hindi vs. Sanskrit implicit-final-a).
**When to avoid:** When the modes differ widely enough that one shared rule set becomes unmaintainable — ship two keyboards.
**Combines well with:** Any primary strategy (S-11 wraps `if(style='X')` around its rules).
**Pattern mapping:** `strategyId: "S-11"`; wraps an inner strategy named in `combinesWith`.

```
store(style) 'dot'

if(style='dot') + [CTRL '.'] > set(style='bar')
if(style='bar') + [CTRL '.'] > set(style='dot')

if(style='dot') + 'Z' > U+1E62
if(style='bar') + 'Z' > U+0053 U+0329
```

**Real exemplar:** `release/sil/sil_yoruba8/source/sil_yoruba8.kmn` — `Ctrl+.` toggles dotted-below vs. bar-below styles.

#### S-12 DLL IME callout

**When to use:** A1=massive AND A2=logographic. Tens of thousands of Han characters — too large for Keyman rules; delegate to a native IME.
**When to avoid:** Anywhere else. Locks the keyboard to one OS (Windows) and a shipped DLL — incompatible with cross-platform Keyman targets.
**Combines well with:** Nothing — a thin shim.
**Pattern mapping:** `strategyId: "S-12"`; `combinesWith: []`.

```
store(DLLFunction) "KeymnIMX.DLL:FindGlyph"

+ any(VKeys)  > call(DLLFunction)
nomatch       > call(DLLFunction)
```

**Real exemplar:** `release/c/cs_pinyin/source/cs_pinyin.kmn` — 100k+ Han characters via Pinyin lookup, delegated to a Windows DLL.

#### S-13 Touch layer switch

**When to use:** Any touch keyboard with more than one named layer (numeric, symbol, alt-script, shift-alternate). The switch key uses `"nextlayer":` in the Keyman touch layout JSON to swap the visible layer — no KMN rules are required for the layer switch itself.
**When to avoid:** Desktop-only keyboards; single-layer touch keyboards.
**Combines well with:** S-01, S-02, S-03, S-05, S-06, S-07, S-08, S-09 — whichever character-entry strategy governs the content within each layer. S-13 is structural: it wraps the content strategy rather than replacing it.
**Pattern mapping:** `strategyId: "S-13"`; `combinesWith: []` (the pattern document leaves the choice of content strategy to the author — any S-01–S-09 combination is valid).

```json
{
  "layer": [
    { "id": "default", "row": [
        { "id": 1, "key": [
            { "id": "K_A", "text": "a" },
            { "id": "T_switch_num", "text": "123", "sp": 1, "nextlayer": "numbers" }
          ]
        }
      ]
    },
    { "id": "numbers", "row": [
        { "id": 1, "key": [
            { "id": "T_1", "text": "1" },
            { "id": "T_switch_def", "text": "ABC", "sp": 1, "nextlayer": "default" }
          ]
        }
      ]
    }
  ]
}
```

**Real exemplar:** `release/sil/sil_ipa/source/sil_ipa.keyman-touch-layout` — five named layers (`default`, `shift`, `numeric`, `diacritic`, `supersub`); dedicated switch keys on each layer use `"nextlayer":` to navigate the full layer set.

### 7.4 Building blocks

Applied **inside** the strategies above, never chosen independently. The studio invokes them as a keyboard grows.

**7.4.A Smart-backspace / atomic cluster deletion** — recognise a composed cluster in context and delete it as one unit. Use whenever a strategy produces multi-codepoint output (S-02, S-06, S-07, S-09).
```
any(bar) U+0329 + [K_BKSP] > nul
any(dot+nsl) any(ac.all) + [K_BKSP] > nul
```

**7.4.B `nul` swallow** — disables a key entirely; suppress unused QWERTY keys, or silently drop an invalid sequence (the soft-constraint counterpart to S-10).
```
store(disabled) "QWRYUIPASFGHKLZCVBM"
+ any(disabled) > nul
```

**7.4.C `outs()` store composition** — expand one store inside another to build composite tables without repetition ("all decorated vowels", "everything-but-the-grave-set").
```
store(grv.all) outs(base) outs(grv) outs(acu) outs(crc) outs(mac)
```

**7.4.D `notany()` + `context(N)` deadkey fallback** — when the key after a deadkey isn't an expected continuation, emit the bare base and put the typed key back. Essential for any deadkey strategy (S-02, S-06).
```
dk(grave) notany(graveK) > '`' context(2)
```

**7.4.E `nomatch` group routing** — catch-all that routes unmatched input to another group (constraints → main, main → NFC, main → DLL). Used in every multi-group strategy.
```
nomatch > use(main)
```

**7.4.F Multi-group pipeline** — `begin Unicode > use(constraints)`; `constraints` filters then `nomatch > use(main)`; `main` works then `nomatch > use(NFC)`. Compose around any combination of primaries.

### 7.5 Self-check / validation table

The decision tree must agree with the strategy each exemplar actually uses. This round-trip is the **regression suite**: if "Tree → strategy" disagrees with "Actual primary," the tree is wrong, not the keyboard. Re-run it after any edit to 7.1/7.2/7.3.

| Exemplar | A1 | A2 | A3 | A3a | A4 | A5 | A6 | A7 | A7a | Tree → strategy | Actual primary |
|----------|----|----|----|-----|----|----|----|----|-----|-----------------|----------------|
| `release/a/akan/` | tiny | alphabetic | strong | — | none | single | none | many | addition | rule 11 → S-01 | S-01 ✓ |
| `release/sil/sil_euro_latin/` | large | alphabetic | strong | — | multi-family | single | none | RAlt only | addition | rule 6 → S-06 | S-02 + S-04/S-08 ✗ |
| `release/sil/sil_ipa/` | medium | alphabetic | strong | postfix | none | single | none | many | addition | rule 3a → S-03 + S-04 | S-03 + S-04 ✓ |
| `release/sil/sil_devanagari_phonetic/` | medium | abugida | strong | — | none | single | none | many | — | rule 2 → S-09 + S-05 | S-09 + S-05 ✓ |
| `release/v/vietnamese_telex/` | medium | alphabetic | strong | — | replacing-cycling | single | none | many | addition | rule 3 → S-07 + S-04 | S-07 ✓ |
| `release/sil/sil_yoruba8/` | medium | alphabetic | strong | — | multi-family | two-orthography | none | many | addition | rule 4 → S-11 wrap | S-11 ✓ |
| `release/a/armenian_mnemonic_r/` | medium | alphabetic | weak | — | none | single | none | RAlt only | full-remap | rule 8 → S-06 + S-04 + S-08 | S-06 + S-04 + S-08 ✓ |
| `release/el/el_pasifika/` | small | alphabetic | strong | — | stacking-combining | single | loud | many | addition | rule 7 → S-02 + rule 9 → +S-10 | S-02 + S-10 ✓ |
| `release/c/cs_pinyin/` | massive | logographic | weak | — | none | single | none | many | — | rule 1 → S-12 | S-12 ✓ |
| `release/itrans/itrans_devanagari_hindi/` | large | abugida | strong | — | none | two-orthography | none | many | — | rule 2 → S-09 + S-05; rule 4 wraps S-11 | S-09 + S-05 + S-11 ✓ |
| `release/sil/sil_pan_africa_mnemonic/` | large | alphabetic | weak | — | multi-family | single | none | many | addition | rule 6 → S-06 + S-04 | S-06 + S-04 ✓ |
| `release/a/arabic_izza/` | medium | abjad | weak | — | none | single | none | many | — | rule 2 → S-09 | S-09 ✓ |
| `release/r/russian_mnemonic_r/` | medium | alphabetic | weak | — | none | single | none | RAlt only | full-remap | rule 8 → S-06 + S-04 + S-08 | S-06 + S-04 + S-08 ✓ |

Note: S-04 (`any`/`index` table mechanism) is structurally embedded in every S-06 deployment; rows that list S-06 implicitly include S-04.

**Known mismatches (intended v1.1 work, not bugs).** Rule 8 (added in v1.0.1) closed the alphabetic full-remap gap; Armenian and Russian mnemonic now round-trip correctly. Rule 3a (added in v1.1.1) closed the IPA postfix-sequence gap. One exemplar still doesn't round-trip; it marks a tree gap to fix in v1.1:

- **EuroLatin**: A2=alphabetic, A1=large, A4=multi-family, A3=strong, A7a=addition. Tree picks **S-06 (two-tier chained deadkeys)** but the actual keyboard uses **S-02 with broad parallel stores**. Add an A3-and-scale tie-breaker inside rule 6 that prefers S-02 + broad S-04 over S-06 when the diacritic families are independent rather than nested.
- **IPA**: ~~A3=strong but the user prefers sequence modifiers~~ — closed in v1.1.1 by rule 3a (A3a=postfix → S-03 + S-04). See §7.1 A3a.

This remaining mismatch is **the value of the validation pass** — it pinpoints where v1 needs work before release. It is not a v1 blocker: EuroLatin is expert-authored, well outside the target user's profile, and the strategy the tree picks (S-06) produces a working keyboard even if it differs from what SIL chose.

**Phase-gated elicitation gaps (intended phased-delivery omissions, not tree bugs).**  The following §7.2 rules cannot fire from the currently shipped survey phases (A, B, F) because the required axis is not yet elicited.  Each is gated on Phase C delivery.  The §7.5 validation rows for these exemplars confirm the *tree logic* is correct when a full axis vector is supplied — the gap is upstream in the survey layer.

- **Rule 3 / S-07 (A4=replacing-cycling):** `phase_b_characters.yaml` elicits A4=stacking-combining and A4=multi-family but defers A4=replacing-cycling to Phase C (see YAML engine-notes TIMING NOTE).  The `vietnamese_telex` §7.5 row confirms the tree fires correctly when supplied A4=replacing-cycling; it cannot be reached through the live survey until Phase C adds a replacing/cycling probe.

- **Rules 4 and 9 / S-11, S-10 (A5=two-orthography, A6=loud):** Neither A5 (multi-mode orthography) nor A6 (constraint enforcement) is elicited by any current phase.  The `sil_yoruba8` (rule 4) and `el_pasifika` (rule 9) §7.5 rows confirm correct tree behaviour given a full vector; they are Phase C-gated.

- **Rule 8 / S-06 (A7a=full-remap for alpha-nonlatin users):** `phase_b_characters.yaml` routes the `alpha-nonlatin` sub-branch of `pb_non_roman_branch` directly to `pb_special_letters` without asking about remap posture (A7a).  Keyboards like `armenian_mnemonic_r` and `russian_mnemonic_r` that use a Latin base but replace nearly every key (A7a=full-remap) cannot be correctly classified until an A7a probe is added to that branch.  Spec §7.1 notes this as a Phase B follow-up; it is outstanding.

Once import lands, the validation pass also runs against each exemplar's *imported* IR — the round-trip emit must produce the same strategy attribution. A mismatch here surfaces as an `ImportStatus.RoundTripDivergence` for that exemplar in the supportability scanner output (§13).

**Touch strategy validation (S-13).** S-13 is not reached by the desktop decision tree above — it is selected whenever a touch keyboard's layout JSON defines more than one named layer. The A1–A7 axes do not apply; the confirmation criterion is simply the presence of `"nextlayer":` on one or more keys.

| Exemplar | Touch layers | S-13 confirmed |
|----------|--------------|----------------|
| `release/sil/sil_ipa/` | 5 layers: `default`, `shift`, `numeric`, `diacritic`, `supersub` | ✓ |
| `release/sil/sil_khmer/` | 4 layers: `default`, `shift`, `ctrl-alt`, `shift-ctrl-alt` | ✓ |
| `release/sil/sil_hebrew/` | 4 layers: `default`, `shift`, `rightalt`, `rightalt-shift` | ✓ |

#### 7.5.1 Corpus evaluation protocol

The hand-enumerated table above is the **seed fixture set**; once the KeyboardIR codec (§5a) and pattern recognizer (§8 step 2) land, the same round-trip runs at corpus scale. For every `release/` keyboard that passes the Layer A' import-fidelity checks: parse to IR, run the recognizer, derive the axis vector from the lifted patterns and IR structure, run the decision tree (§7.2), and compare the tree-selected primary against the dominant `strategyId` among the recognized patterns. Disagreements are emitted as `StrategyDivergence` records in the supportability scanner output (§13). Divergence *clusters* — many keyboards mis-routed the same way — are how the tree finds its next rules: the EuroLatin and IPA mismatches above were found by hand; the corpus pass finds the rest. Isolated divergences are triaged the same way as the known mismatches: the tree may be wrong, or the keyboard may be idiosyncratic — the record carries enough provenance to decide.

### 7.6 Corpus-derived placement priors

*Added 2026-06-11 (v1.1.1). Full analysis: [docs/placement-intelligence-review.md](docs/placement-intelligence-review.md).*

Strategy selection (Sec 7.2) decides **how** characters are entered; this section governs **where** they land — which key, modifier layer, and trigger the seeder proposes. The seeder's first-principles signals (the anchor cascade: NFD base → Unicode name → confusable → visual → phonetic) are complemented by an **empirical prior** mined from `keymanapp/keyboards/release/`: the placements that ~900 working, community-adopted keyboards actually chose.

**Extraction.** A post-pass over the KeyboardIR codec — `emitPlacementMap(ir)` — recovers `(codepoint → key, modifier set, mechanism, BCP47 context, base-layout family)` tuples; the supportability scanner drives it in batch over `release/`, so keyboards failing Layer A' never enter the dataset. Mandatory filters: tag and exclude mnemonic-layout keyboards from the positional dataset; detect undeclared non-US bases (more than 3 letter-key assignments deviating from their US-QWERTY ASCII equivalents — a tunable threshold, calibrated to catch AZERTY's four remapped letter keys without flagging QWERTZ's single Z↔Y swap) and record their placements relative to the inferred base; collapse CAPS/NCAPS rule pairs to one canonical tuple; skip legacy `begin ANSI` groups (rare in current `release/` — mostly a `legacy/` and pre-2010 concern, and usually co-occurring with the mnemonic-layout tag); drop PUA output (U+E000–U+F8FF). The result is a versioned, pinned `placement-priors.json` built offline and shipped as data — never computed in the SPA (same policy as the seeder's vendored Unicode/CLDR data).

**Aggregation and weighting.** For each (codepoint, script class, base-layout family): weight a candidate placement by the number of *independent* keyboards choosing it — fork-copy trees (near-identical rule sets under different names) collapse to one vote; standards-body and long-maintained flagship keyboards earn a bonus; keyboards matching the "free keys filled left-to-right" anti-pattern (codepoint order correlating with QWERTY free-key order) are discarded from the consensus pool. Priors never cross script classes or base families: AZERTY conventions (Francophone-Africa) are real and prescriptive *within* AZERTY, and must not bleed into QWERTY recommendations.

**Blending with first principles.** The seeder ranks candidates: corpus prior (when ≥3 independent sources agree; otherwise the phonetic anchor leads) → phonetic anchor → shift-pair consistency (hard constraint: case pairs share a key) → visual/NFD anchor → base-key preservation (never silently displace a needed base character) → ergonomics tiebreak. Each per-character proposal carries its provenance (`priorSource`, `priorCount` on the placement-map type — fields settled at the same joint session that locks that type) and a ranked candidate list, not a single answer.

**Precedence rule (precedent vs. first principles).** When the prior and the anchor cascade disagree: ≥3 independent converging keyboards → precedent wins, sources cited. Single-origin precedent (one root keyboard everyone copied) → first principles win, but the conflict is shown to the user with both options. For abjads and abugidas, community convention is effectively never overridden — shaping engines, fonts, and OS text stacks assume the converged sequences; a divergent first-principles suggestion is an escalation, not an auto-override. The studio **never resolves a placement conflict silently**: the author is the authority on what their community will adopt, and every proposal is confirmable, provenance-labeled, and overridable (the same *propose → cross-check → confirm* posture as the linguist agent, §8 Phase B).

---

## 8. Data flow

*Revised 2026-06-08 (v1.1.0 KeyboardIR import). See [docs/spec-amendment-2026-06-08-keyboardir.md](docs/spec-amendment-2026-06-08-keyboardir.md).*
*Revised 2026-06-11 (v1.1.1 placement priors). See [docs/spec-amendment-2026-06-11-placement-priors.md](docs/spec-amendment-2026-06-11-placement-priors.md).*

1. **Source selection.** The source-selection browser offers the user one of four sources for the session: the bundled US-English fallback (preselected), any `release/basic/*` layout, any other `keymanapp/keyboards/release/` keyboard, or an uploaded `.kmn`. The user picks exactly one. There is no multi-source merge.

2. **Parse to IR.** The KeyboardIR codec (§5a) parses the chosen source's `.kmn`, `.kvks`, and `.keyman-touch-layout` into a `KeyboardIR`. Unrecognized features (save/set/reset/if option-store, call/return, indexed context(n), outs(), SMP 5-digit literals) become `RawKmnFragment` nodes with `origin: 'imported'` (D8). The pattern recognizer then walks the IR and lifts node clusters matching recognizer rules into `Pattern` instances with `origin: 'recognized'` and back-references via `ownedNodes`. Lifted nodes become survey-editable; unlifted nodes stay opaque. The Layer A' import-fidelity checks (I1-I5, §10) run at this point; a parse failure halts the session and surfaces the codec error to the user.

3. **Scaffold over the IR.** The scaffolder applies identity propagation (resets `header.keyboardId`, `header.bcp47`, `header.copyright`, `header.version`) and the template-cleanup pipeline (NCAPS strip, `[CAPS]` deletion, `&CasedKeys` insertion, touch-layout cleanup) **directly on the IR**. For a US-English-fallback session this is the same template cleanup v1 already performs; for an imported `release/` keyboard the scaffolder runs the same cleanups over the imported IR. Layer C hygiene runs after scaffolding. The author sees a clean-by-construction IR before they touch anything.

4. **Carve gallery.** Before the Phase A identity survey runs, the carve gallery renders every rule, store, group, touch key, and recognized Pattern in the IR as a card. The author can keep, edit (survey-editable cards only — recognized Patterns and scaffolded slots), or delete each card. For a US-English-fallback session the carve gallery is mostly pass-through (the user typically keeps everything). For an imported `cm_qwerty` adapted to one Cameroonian language, carving away the other languages' rules is the bulk of the work. The mechanism is identical in both cases.

5. **Survey — Phase A (Identity + routing).** User enters language name, localized language name (autonym), BCP47 tag (with langtags.json lookup), display name, copyright holder. System detects script group (QWERTY/QWERTZ, AZERTY, or non-Roman) from BCP47 + the IR's structural shape and confirms with the user. This routes all subsequent phases. Phase A also surfaces v1's desktop-first authoring posture (Decision 6, Sec 14) — mobile-primary authors are notified that the survey is anchored to physical-keyboard mental-model answers before they invest survey time. The touch layout is still produced in Phase E. Phase A optionally collects **provenance metadata** (`KeyboardProvenance` in `@keyboard-studio/contracts`) — requester identity and contact, language-community representative, speaker count, language status, regions, existing tools, orthography link, casing notes, and free-form notes (the intake fields carried over from the legacy manual request form). Provenance is **non-gating**: it never blocks a phase exit or the submit button, and is serialized into the package / PR body for attribution and contact at output (Sec 12), never into the `.kmn`. The localized name is the one provenance field that may also feed a build artifact (the `.kps` / `welcome.htm` display). This is metadata capture only — it is distinct from the out-of-scope triage tool (Sec 16) and implies no request queue or assignment workflow.

6. **Survey — Phase B (Character coverage + strategy axes).** User pastes or lists target characters. Studio diffs against the IR's output set and, for each new character, the user states which key it lives on and under what modifier. Crucially, this phase also **computes the discovery axes** (Sec 7.1): the character count fixes A1 (scale), the diff and a few plain-language follow-ups fix A3 (phonetic intuition), A3a (mark-input order — alphabetic only), A4 (diacritic behavior), and A7 (spare-key availability). The output method is **not** assumed to be simple substitution — Phase B feeds the axis vector to the strategy selector (Sec 7.2), which picks the right strategy. A simple one-key-per-character swap (S-01) is only the result when the inventory is tiny and phonetic; larger or diacritic-heavy inventories route to deadkey composition (S-02), mnemonic spelling (S-05), diacritic cycling (S-07), context-sensitive clusters (S-09), and so on.

**Placement proposals.** When a placement map (the seeder output of Sec 7.6) is available for the session, its entries pre-fill the per-character key/modifier questions instead of leaving them blank: above the confidence threshold the proposal renders as an editable pre-fill; below it, as an advisory chip beside an empty field. Every proposal shows its provenance — a corpus citation ("N existing keyboards for similar languages place this here") or an anchor type (decomposition, name, look-alike, phonetic) — and is overridable in place. Collisions (two characters proposed onto the same key+modifier) are surfaced as a single resolve-one question rather than two silent pre-fills. Per-strategy key choices (the S-02 deadkey trigger, S-06 family keys, S-07 cycle key, S-09 consonant grid) follow the **Placement semantics** notes on the corresponding Sec 7.3 cards. The proposal flow never auto-commits: the user confirms or overrides each placement, mirroring the linguist-agent posture (propose → cross-check → confirm) used for the character inventory below.

To seed this phase the studio offers several **character-discovery** methods (`CharacterDiscoveryService`). No single source is assumed available, so the methods are complementary and the inventory may be built from any combination:

- **Manual** — list the characters by hand. Always available.
- **Text sample** — paste a corpus; the studio grapheme-segments it, ranks the distinct characters by frequency, and diffs them against the base output set.
- **Linguist agent** (the orthography / authoritative-source method) — given the language name + BCP47 tag, an LLM linguist agent synthesizes a structured, NFC-normalized inventory from CLDR `exemplarCharacters` cross-referenced with orthography references (language academies, Omniglot, trusted corpora). It returns core and auxiliary alphabets (with case pairs), mandatory diacritic/ligature bundles, language-specific punctuation, and numerals — usually the single most reliable signal for which characters a language needs. A **deterministic CLDR cross-check** then flags divergences (a character the agent added that CLDR/orthography don't attest; a CLDR-attested character the agent dropped), and the result is presented to the user for confirmation — never trusted silently. The prompt template lives in `docs/prompts/character-inventory-linguist.md`; the structured result is the `LinguistInventory` contract type.
- **Visual picker** — browse a script-scoped grid (seeded from the language's CLDR exemplar characters, falling back to the script's Unicode block) and click the characters to include. This is the fallback when the author has neither text nor a language the agent can resolve.

Whatever the method, the result pre-fills the target-character inventory, which the user confirms or edits; the strategy selector (Sec 7.2) then runs over the confirmed set. Discovery is **character enumeration only** — no wordlist or prediction model is built (Sec 16); frequency, where a method provides it, is advisory and may hint key placement. (The picker and the linguist agent's cross-check reuse the same pinned Unicode/CLDR signal as the kbgen placement seeder.) **Normalization note:** the linguist inventory is NFC for character identification and display; how the keyboard normalizes its *output* (e.g. the NFD reorder auto-emitted for Latin groups in Phase C' below) is a separate, later concern and is not constrained by the inventory's NFC form.

**Placement habits (Q1 — existing keyboards, axis-refining).** Knowing which keyboards community members use today lets the studio propose key placements that feel familiar and predicts adoption of the new layout. "What do people in your language community use today to type — a standard keyboard meant for another language, an older Keyman keyboard, or some other workaround?"

**Placement habits (Q2 — co-installed keyboards, axis-refining).** Other keyboards on the same machine constrain which key combinations must not be accidentally blocked or remapped. "Are there other keyboards that must keep working on the same device — for example, a French, English, Arabic, or Devanagari keyboard for a different language?"

**Mark-input order (Q3 — A3a sub-axis, axis-refining, alphabetic only).** Whether the community presses the diacritic key before or after the base letter determines whether a deadkey or a sequence-replace strategy better matches their habits. "When typing a letter with a diacritic, does the typist expect to press the diacritic key before the letter, or type the letter first and then the diacritic?" This is the A3a elicitation question; it is shown only when A2=alphabetic AND A3=strong.

**Contact-language loanwords (Q4 — placement advisory, non-gating).** Common borrowed words, names, and URLs constrain which base keys may be reassigned without breaking the community's ability to type contact-language text. "Are there common borrowed words, people's names, or website addresses that the keyboard must also be able to type?"

**Legacy text encoding (Q5 — normalization advisory, non-gating).** Existing community documents may have been produced with keyboards using non-standard character sets; knowing this lets the studio surface compatibility warnings before Phase C'. "Does existing text in your language come from older systems where the keyboard used a non-standard character set — sometimes called a 'legacy encoding' — rather than the international Unicode standard?"

**Primary use case (Q6 — placement advisory, non-gating).** Literacy and school materials require every character to be reachable without extra steps; texting and official-document workflows have different frequency-vs-completeness trade-offs. "What will this keyboard mainly be used for — school materials, everyday texting, or official documents?"

Answers to Q1 and Q2 are advisory for the placement-prior lookup (§7.6): the prior query uses them as community-context to surface "communities with a similar existing keyboard chose…" in placement proposals. Q4–Q6 are non-gating advisories only; they never block a phase exit or the submit button.

7. **Gallery — Phase C (Special inputs).** Driven by the strategy selector's result (primary + secondaries, Sec 7.2). The gallery surfaces the **recommended strategy's** patterns first as live mini-keyboards (e.g. a deadkey demo for S-02, a tone-cycle demo for S-07); secondary and less-common strategies sit behind "show me more." This phase also resolves the remaining axes that need a judgment call — A5 (multi-mode), A6 (constraint enforcement), and A2a (cluster sensitivity) — which can add S-11, S-10, or S-09 to the recommendation. User taps each demo, confirms the ones that match their language, and fills plain-language slot questions. Each selected pattern is inserted as a validated KMN skeleton tagged with its `strategyId`.

8. **Gallery/auto — Phase C' (Reordering).** (C-prime.) QWERTY/QWERTZ and AZERTY groups get NFD normalization auto-emitted unless the IR already has a reorder scheme. Non-Roman groups see a curated reorder gallery (pre-base vowel, halant/conjunct, tone-mark, subscript stacking) and pick the pattern matching their script family.

9. **Auto + survey — Phase D (OSK desktop).** OSK `.kvks` is auto-populated from rule output; modifier-name consistency enforced across `.kmn`/`.kvks`/`.keyman-touch-layout`; `usealtgr` tag auto-inserted when `RALT` is present. Survey intervenes only when modifier-naming intent is ambiguous.

10. **Gallery — Phase E (Touch layout).** Touch layout JSON scaffolded from desktop KVK via modifier-to-layer mapping. User sees touch-feature galleries (longpress menus, layer switching, flicks, multitap) as live tappable demos and enables those that fit their language. Output validated against the touch-layout JSON schema.

11. **Survey — Phase F (Help docs).** `welcome.htm` generated from template (BCP47 lang attr from Phase A, no version, no copyright). User writes descriptive content; `help/<name>.php` regenerated deterministically from the same content, guaranteeing body+style parity.

12. **Auto — Phase G (Package).** `.kps` pre-populated: `LICENSE.md` as license file (avoids `KM0900A`), "Follow keyboard version" set, language tags from Phase A, Files block matches `targets`.

13. **Live preview.** Every edit triggers a 300 ms debounce; kmcmplib compiles to blob URLs; KeymanWeb reloads with the new keyboard; lint chips appear for any diagnostics. Submit button is blocked until zero warnings.

14. **Lint and validate.** Layer A (validity) + Layer B (style) run on every edit; Layer C (hygiene) runs on each phase exit and at submit. Green checks pass silently; yellow checks surface as survey questions at the relevant phase; red checks appear as a final checklist before PR submission.

15. **Output.** User chooses download `.zip` (virtual FS serialized, readme on next steps, no auth required) or GitHub OAuth fork+draft PR (fork `keymanapp/keyboards`, branch `add/<id>`, commit the IR-emitted source tree (no compiled artifacts), open draft PR with auto-generated body listing green checks passed, yellow items by criteria section, red items as a final checklist, plus copyright attestation). The emitter renders the final `.kmn`, `.kvks`, and `.keyman-touch-layout` from the IR (D9). For sessions whose source was not the US-English fallback, the original `.kmn` is preserved as a `<id>.kmn.imported` sidecar in the `.zip` and OAuth working tree; the sidecar is excluded from the PR commit (§12).

---

## 9. Three-group routing

*Revised 2026-06-08 (v1.1.0 KeyboardIR import). See [docs/spec-amendment-2026-06-08-keyboardir.md](docs/spec-amendment-2026-06-08-keyboardir.md).*

The survey branches at Phase A based on BCP47 tag, base-keyboard choice, and user confirmation. The three groups share the same phase structure but differ in authoring emphasis, reordering load, and `&CasedKeys` content.

| Group | Typical bases | Primary challenges | CasedKeys default | Reorder posture |
|---|---|---|---|---|
| QWERTY / QWERTZ | `release/basic/*`, English/German-family | Character substitution, diacritics via deadkeys, occasional RALT/AltGr | `[K_A]..[K_Z]` | NFD normalization; auto-emitted unless base has its own scheme |
| AZERTY | French/Francophone-Africa bases | Position remapping (Q<->A, W<->Z), shifted digits, heavy AltGr layer | `[K_A]..[K_Z] [K_0]..[K_9] [K_HYPHEN] [K_EQUAL] [K_LBRKT] [K_RBRKT] [K_BKSLASH] [K_QUOTE] [K_COMMA] [K_PERIOD] [K_SLASH] [K_COLON]` | NFD normalization; auto-emitted unless base has its own scheme |
| Non-Roman | Curated bases per script family (Indic, Arabic, Hebrew, SEA, etc.) | Character mapping, heavy reordering, script-specific OSK conventions | Typically omitted; survey confirms per script (see decision in Sec 14) | Gallery-picked: pre-base vowel, halant/conjunct, tone-mark, subscript stacking |

**Routing decision.** Group is detected automatically from the BCP47 script subtag (from Phase A) and the IR's structural shape (which scripts its rules already emit), then confirmed with the user in a single plain-language step before the survey continues. Non-Roman group is further sub-routed to a script-family branch (Indic, Arabic, SEA, etc.) that controls which reorder patterns are shown in Phase C'.

The three groups are the coarse expression of discovery axis **A2 (script class, Sec 7.1)**: QWERTY/QWERTZ and AZERTY are both *alphabetic*; the Non-Roman group spans *abugida / abjad / syllabary / logographic*, which the strategy selector then refines (e.g. abugida + cluster sensitivity → S-09). Routing narrows the field; the decision tree (Sec 7.2) picks the specific output strategy within it.

**Reorder priority order.** (1) Adopt the base keyboard's existing reorder scheme if present. (2) Otherwise, for QWERTY/QWERTZ and AZERTY, auto-emit a standard NFD-normalization `group(reorder)`. (3) For non-Roman, present the curated reorder pattern gallery; user picks the pattern matching their script's behavior. The LLM maps user intent to slot values; it does not author group chains from scratch.

**CJK and Ethiopic — v1 exclusion.** CJK and Ethiopic script families are acknowledged members of the Non-Roman group but are excluded from v1. Their reorder patterns require specialist curation not yet complete. The gallery renders a "not yet supported" stub for these scripts rather than an empty gallery, so users receive a clear explanation rather than a silent gap. This exclusion is enforced as a Phase A detection gate: CJK (Han and Hangul) and Ethiopic are detected at the Phase A `primary_script` step and routed to a "not yet supported" `notice` screen that exits the flow before the character survey — not only as a gallery-side stub.

---

## 10. Validator and lint engine

*Revised 2026-06-08 (v1.1.0 KeyboardIR import). See [docs/spec-amendment-2026-06-08-keyboardir.md](docs/spec-amendment-2026-06-08-keyboardir.md).*

The validator is the sole arbiter of what the survey and LLM are allowed to emit. Existing keyboards in `release/` are not treated as authoritative — the corpus contains both clean and defective patterns, and bad patterns must not survive by inertia.

### Three-layer architecture

| Layer | Name | Runs | Packages |
|---|---|---|---|
| A | Validity (structural + semantic) | Per-keystroke (TS checks) + per-compile (WASM oracle) | `@keymanapp/kmn-validator` |
| B | Style / canonical form | Per-compile (TS AST rules) | `@keymanapp/kmn-validator` |
| C | Repo hygiene (criteria.md) | Per-phase-exit + at submit | `@keymanapp/keyboard-lint` |

**Lint and compile cycle.** One debounce cycle (300 ms) runs two concurrent microtasks: the TS-check pass and the WASM oracle. A TS-check error suppresses the WASM call; a WASM diagnostic always supersedes a conflicting TS diagnostic. This is the resolved single-cycle design (see Sec 14, decision 3).

### Layer A: the 14 compiler checks

**9 checks portable to TypeScript (run per-keystroke, <100 LOC each):**

| # | Check | Source |
|---|---|---|
| 1 | Identifier validation | `validation.cpp:79-127` — names 1-255 chars, no spaces/parens/brackets/commas/controls |
| 2 | Duplicate group names | `CheckForDuplicates.cpp:13-29` — case-insensitive |
| 3 | Duplicate store names | `CheckForDuplicates.cpp:31-52` — case-insensitive; system stores exempt |
| 4 | Deprecated store IDs | `DeprecationChecks.cpp:16-50` — `TSS_LANGUAGE`, `TSS_LAYOUT`, `TSS_LANGUAGENAME`, `TSS_ETHNOLOGUECODE`, `TSS_WINDOWSLANGUAGES` illegal since v10 |
| 5 | Deadkey resolution | `Compiler.cpp:2188-2205` — valid identifier; auto-register or lookup |
| 6 | `if()` store resolution | `Compiler.cpp:2833-2906` — referenced store exists |
| 7 | Codepoint validation (`U+XXXX`) | `Compiler.cpp:3746-3770` — 0-0x10FFFF, excluding surrogates and non-characters |
| 8 | Context statement ordering | `Compiler.cpp:1509-1520` — `nul` first; `if()`/`platform()`/`baselayout()` before other content; no virtual keys in context (ERROR_VirtualKeyInContext enforced at `Compiler.cpp:1524`) |
| 9 | `index(store, N)` offset validity | `Compiler.cpp:1435-1497` — store exists, length >= any() length |

Note: checks #9 and #13 both run inside CheckStatementOffsets (Compiler.cpp:1435-1501); the cited sub-ranges identify the specific guard expressions, not disjoint regions.

**5 checks deferred to the WASM compiler oracle (deep, stateful):**

| # | Check | Source |
|---|---|---|
| 10 | CAPS/NCAPS consistency | `CheckNCapsConsistency.cpp` — cross-rule modifier state |
| 11 | Unreachable rules | `UnreachableRules.cpp` — whole-group shadowing analysis |
| 12 | `platform()` argument parsing | `Compiler.cpp:2793-2831` — deep `GetXString` parser |
| 13 | `context(N)` offset validity | `Compiler.cpp:1437-1501` — depends on parsed context length |
| 14 | Named code constants | `NamedCodeConstants.cpp` — 4000+ Hangul syllables and named codepoints |

All 14 checks have corresponding message entries in `kmn-compiler-messages.ts`; message text and severity are already typed and importable.

Note: checks #1-9 are portable to TypeScript and run per-keystroke. Checks #10-14 are WASM-only and share the 300 ms debounce cycle.

#### Layer A' — import fidelity (5 checks)

Layer A' runs on every codec parse (after import) and on every emit (before output). It is part of `@keymanapp/kmn-validator`. The checks are:

| # | Check | Severity | When |
|---|-------|----------|------|
| I1 | **Parse cleanliness** — the codec parsed the source without falling back to `RawKmnFragment` for *known-supported* features. | `warning` (per fragment) | On import |
| I2 | **Round-trip functional equivalence** — emit the IR, re-parse, compare against the bounded enumeration corpus (D7); the input->output map must be identical. | `error` | On import and on every emit during authoring |
| I3 | **Comment preservation** — every `IRComment` with `anchor: 'leading' \| 'trailing'` is emitted attached to the same anchor node it imported with. | `warning` | On emit |
| I4 | **Recognized ratio** — `ImportReport.recognizedRatio` is reported informationally; no threshold blocks submission. | `info` | On import |
| I5 | **Unsupported feature inventory** — every `RawKmnFragment` produces one entry in `ImportReport.opaqueFeatureInventory`. | `info` | On import |
| I6 | **Ownership consistency** — for every `nodeId` in `Pattern.ownedNodes`, the referenced IR node's `ownedByPattern` field equals that Pattern's `id`. A stale forward pointer after Pattern deletion would orphan IR nodes (permanent carve-gallery suppression of nodes whose Pattern no longer exists). | `error` | On emit |

A failing I2 halts the authoring session: the IR cannot be trusted as the source of truth (D9) if the emit does not round-trip. I1, I3, I4, I5 are informational/warning and do not block authoring. The supportability scanner CLI (§13) runs the same checks in batch over `release/` and aggregates the reports.

### Implementation phases

- **Phase 1 — Oracle mode.** TypeScript wraps the WASM `kmcmplib` in a `validate(source) -> diagnostics` entry point. Maps compiler diagnostics through the message catalog. No new parser. Full coverage of all 14 checks.
- **Phase 2 — AST mode.** Hand-written TS lexer+parser produces an AST for `.kmn`. Cross-validated against `keyman/common/test/keyboards/baseline/` (~1000 known-good fixtures) and against kmcmplib accept/reject decisions. Enables per-keystroke feedback without compiler invocation.
- **Phase 3 — Style mode.** Layer B rules plug into the AST: leftover `NCAPS` modifier, `[CAPS ...]` rules, `ALT` where `RALT` was meant, hand-written alternation where `any(store)` is canonical, deadkey names that match their output codepoints.

---

## 11. criteria.md compliance

The 133 criteria in `criteria.md` are classified into four enforcement bands per Decision 4 (Sec 14). The Day-1 triage is recorded as a typed `Criterion[]` in `packages/contracts/data/criteria.json`; per-band rationale and any flagged-for-re-review entries live in `packages/contracts/data/criteria-summary.md`.

**Band 1 — scaffolder-bake.** The scaffolder makes violation impossible at template-fill time. The user never sees these as explicit checks because the bad state cannot exist in their virtual FS.

**Band 2 — layer-c-enforce.** The user could violate during authoring; the lint engine catches it on every 300 ms debounce cycle. Layer C blocks phase progression on `error`/`fatal`.

**Band 3 — yellow-survey.** Requires reading and understanding content, consulting a public resource (langtags, Ethnologue, organization website, `s.keyman.com`), or making a judgment call. Surfaced as plain-language survey questions at the relevant phase.

**Band 4 — red-checklist.** Requires out-of-band information no public source records (e.g. original-author permission for a third-party patch). Pre-submit manual checklist; the PR body flags them for the reviewer.

| Band | Count | Example criterion | Enforcement |
|---|---|---|---|
| scaffolder-bake | 38 | "No leading zeros in version components" — regex-checkable, auto-fixable | Scaffolder resets version to `1.0`; further violations cannot be authored. |
| layer-c-enforce | 66 | "BCP47 tag well-formed; modifier names consistent across `.kmn`/`.kvks`/`.keyman-touch-layout`" | Layer C lint engine; blocks phase progression on `error`. |
| yellow-survey | 32 | "BCP47 tag is correct for the language/script" — requires langtags.json lookup and linguistic judgment | Phase A survey asks for the tag; studio cross-checks against langtags.json and flags mismatches for user review. |
| red-checklist | 10 | "If a third party submits a patch to an existing keyboard, original author was consulted" — requires direct author communication | Final checklist item in PR submission flow; PR body includes a reminder block. |

**Total: 146 entries** (the 7.7a split adds 1 entry relative to the original 145-entry Day-1 catalog).

Source-of-truth for the band assignments is `packages/contracts/data/criteria.json` (loadable via `import { ALL_CRITERIA } from "@keyboard-studio/contracts"` or the dedicated `/criteria` subpath). The Day-1 triage closed as issue #6.

---

## 12. Output artifacts

*Revised 2026-06-08 (v1.1.0 KeyboardIR import). See [docs/spec-amendment-2026-06-08-keyboardir.md](docs/spec-amendment-2026-06-08-keyboardir.md).*

### Virtual filesystem (in-memory, emitted at output time)

```text
release/<letter-or-org>/<id>/
  source/
    <id>.kmn                  -- KMN source with all rules, stores, groups
    <id>.kps                  -- package descriptor (XML)
    <id>.kvks                 -- on-screen keyboard source (XML)
    <id>.keyman-touch-layout  -- touch layout JSON
    <id>.ico                  -- keyboard icon
    welcome.htm               -- in-package welcome page
    readme.htm                -- short install description
    help/
      <id>.php                -- online help page (generated from welcome.htm)
  LICENSE.md                  -- "Copyright © <year> <holder>" exact syntax
  HISTORY.md                  -- single entry "1.0 (<YYYY-MM-DD>)" + bullets;
                                 when origin=imported, scaffolder injects an
                                 "Adapted from <sourcePath>" bullet under 1.0
  README.md                   -- no version, no copyright; keyman.com + help links
  tests/
    <id>_tests.kmn            -- round-trip test vectors (from pattern test cases)
```

Compiled artifacts (`.kmx`, `.kvk`, `.js`) are produced by the in-browser compiler service and included in the `.zip` output; they are not committed to source in the PR (criteria SS1).

**Import attribution in committed artifacts (D14).** When `KeyboardIR.origin === "imported"`, the scaffolder injects an "Adapted from `<sourcePath>`" bullet under the 1.0 entry in `HISTORY.md` (`<sourcePath>` is the source-keyboard path the importer recorded). This is the only carrier that survives in the committed PR tree; the full attribution block also lives in the PR body (via `buildImportAttributionBlock()`). `LICENSE.md` carries import attribution only when the source keyboard's licence requires it (e.g. CC-BY); `README.md` never carries it.

### Two delivery modes

**Download `.zip`.** The virtual FS is serialized to a zip archive. A `NEXT_STEPS.md` is appended explaining how to submit to `keymanapp/keyboards`; any supplied provenance metadata (Sec 8 Phase A) is rendered into `NEXT_STEPS.md` for the submitter's reference. Works without a GitHub account.

**GitHub OAuth fork+PR.** User authenticates via GitHub OAuth (`public_repo` scope). Studio forks `keymanapp/keyboards` under the user's account, creates branch `add/<id>`, commits the virtual FS source tree (no compiled artifacts), and opens a draft PR. The PR body is auto-generated:

- Green checks: listed as passing.
- Yellow items: listed by criteria.md section with the relevant field values the studio emitted.
- Red items: listed as a manual checklist for the author to complete.
- Copyright attestation: "I confirm I am the copyright holder or am authorized to submit on behalf of `<holder>`."
- Provenance metadata (when supplied): requester and language-community contact, speaker count, language status, regions, orthography link, and notes — rendered for reviewer context. Non-gating; never written into the `.kmn` source.
- Import attribution (when supplied): the source keyboard the session adapted (e.g. `release/c/cm_qwerty`), the round-trip status, and the `ImportReport.opaqueFeatureInventory` for reviewer context. Non-gating.

---

## 13. Team boundaries

*Revised 2026-06-08 (v1.1.0 KeyboardIR import). See [docs/spec-amendment-2026-06-08-keyboardir.md](docs/spec-amendment-2026-06-08-keyboardir.md).*

### Engine team owns

- Base-keyboard browser (GitHub API client, offline fallback)
- Project scaffolder (template-cleanup pipeline, virtual FS)
- Studio UI shell (SPA framework, phase navigation, lint chip display)
- Live preview pane (KeymanWeb embed, OSK toggle, debounce/compile loop)
- Compiler service (WASM kmcmplib wrapper, blob URL emission)
- Validator / lint engine (Layers A and B: `@keymanapp/kmn-validator`)
- Layer C hygiene lint (`@keymanapp/keyboard-lint`)
- Output paths (zip serialization, GitHub OAuth fork+PR)
- Service interfaces in `packages/contracts` (types for Pattern, LintFinding, SurveyAnswer, VirtualFS)
- KeyboardIR codec (parse `.kmn` + sibling files into IR; emit IR back to `.kmn`)
- Carve gallery UI
- Layer A' import-fidelity checks I1-I5
- Supportability scanner CLI (`utilities/import-scanner/`), the `docs/import-corpus.md` generator, and the CI job that runs the scanner on codec changes

### Content team owns

- Pattern library (mining, curation, slot parameterization, test vectors)
- Survey question text (all `prompt` strings in PatternQuestion)
- Gallery ordering and "show me more" threshold decisions
- LLM prompt templates and grounding context (Keyman reference index build); prompt templates live in `docs/prompts/` (e.g. the Phase B character-inventory linguist agent, `docs/prompts/character-inventory-linguist.md`)
- criteria.md triage: assigning final green/yellow/red classification to each checkpoint
- Pattern recognizer rules (which node-cluster shapes lift to which Pattern; curated per script family, the same rigour as new pattern mining)

### Day-1 joint session (blocking — parallel work cannot start until resolved)

Three contract-lock issues must be resolved in a single joint session before either team begins implementation work:

- **#5** — Lock the Pattern schema (field names, types, placeholder syntax). This spec's TypeScript interface is the proposed starting point, **including the proposed `strategyId` and `combinesWith` fields (Sec 5)** that link each pattern to the strategy catalog (Sec 7); the session ratifies or drops them.
- **#5b** — Lock the KeyboardIR schema (header / store / group / rule / comment / raw fragment / touch / kvks; `IROrigin`, `IRNodeRef`, `ImportStatus`, `ImportReport`). Held jointly with #5; depends on no other issue.
- **#6** — Triage criteria.md into auto-fix (scaffolder/Layer C), template-bake (always-clean output), yellow-survey, and red-checklist. Final counts are inputs to the scaffolder spec and the Layer C implementation.
- **#8** — Define service interfaces in `packages/contracts` (VirtualFS shape, LintFinding type, SurveyPhaseResult, PatternMatch). Both teams build to these interfaces.

After Day 1, engine and content teams work in parallel. The Day-4 integration milestone (issue #31) is the first point where the pattern library plugs into the live survey.

---

## 14. Open questions — resolved decisions

*Revised 2026-06-08 (v1.1.0 KeyboardIR import). See [docs/spec-amendment-2026-06-08-keyboardir.md](docs/spec-amendment-2026-06-08-keyboardir.md).*

The following items were open at the time of the initial draft. Each is now a binding decision for v1. Revisiting any decision requires an explicit revision request following the process in Sec 18.

**Decision 1 — Partial slot-fill.**
Decision: Block submission when a required slot is unfilled. Allow an optional slot to remain empty only if the substituted fragment still passes Layer A validation. The validator adjudicates mechanically; no heuristic or LLM judgment is involved.
Rationale: A partially filled required slot produces structurally invalid KMN. Allowing optional empty stores is safe only when Layer A confirms the resulting fragment is valid, which is a deterministic check.

**Decision 2 — &CasedKeys for non-Roman scripts.**
Decision: The scaffolder defaults to omitting `&CasedKeys` for non-Roman scripts. A survey prompt is shown for scripts with documented case distinctions identified by BCP47 script subtag. The surveyed subtags are: Armn, Geor, Adlm, Osge, Wara, Cher. Determination is cross-referenced against langtags.json.
Rationale: Most non-Roman scripts have no case distinction. Silently emitting a case store for scripts that do not use one produces a spurious store; the survey prompt targets only the scripts where casing is meaningful.

**Decision 3 — Lint vs. compile cycles.**
Decision: One debounce cycle (300 ms). Two concurrent microtasks run within that cycle: the TS-check pass and the WASM oracle. A TS-check error suppresses the WASM call. A WASM diagnostic always supersedes a conflicting TS diagnostic.
Rationale: Two independent debounce timers would produce visible feedback races. Concurrent microtasks within one cycle give the speed of per-keystroke TS checks and the authority of the WASM oracle without user-visible conflicts.

**Decision 4 — Quality bands.**
Decision: Four bands, not three:
(1) Scaffolder bakes clean — enforced at scaffold time, never surfaced to user.
(2) Layer C enforces on every edit — any violation blocks progression.
(3) Yellow survey — criteria requiring judgment are surfaced as plain-language questions at the relevant phase.
(4) Red checklist — criteria requiring out-of-band information appear as a manual checklist before PR submission.
Rationale: The original three-band model collapsed the scaffolder-bake and Layer C enforcement into one "green" band. Separating them clarifies the implementation boundary: band 1 is scaffolder work; band 2 is lint-engine work.

**Decision 5 — CJK, Ethiopic, and Hangul v1 status.**
Decision: CJK, Ethiopic, and Hangul are confirmed excluded from v1. The Three-group routing section (Sec 9) renders a "not yet supported" stub for these scripts. The out-of-scope list (Sec 16) reflects this. These script families are candidates for sprint 2 pattern-library work.
Rationale: Reorder patterns for CJK and Ethiopic require specialist curation that is not complete. Hangul is a third distinct complexity class — jamo cluster-assembly (Dubeolsik/Sebeolsik stateful composition) is different from CJK scale/IME and Ethiopic reorder complexity, but equally blocking in v1 because no jamo composition pattern exists in the library. Shipping a silent empty gallery would mislead users; a stub with an explanation is the correct v1 behavior.

**Decision 6 — Desktop-first authoring scope.**
Decision: v1 supports desktop-first authoring only. The survey, strategy selector, and gallery are anchored to physical-keyboard KMN rules; the touch layout is scaffolded from the desktop OSK in Phase E (no reverse touch-to-desktop derivation in v1). Authors whose primary deployment is mobile are surfaced this posture at Phase A before they invest survey time and may continue with the desktop-first flow (still receiving a derived touch layout). Touch-first authoring is a v1.1 candidate.
Rationale: The strategy framework (Sec 7) and the seven discovery axes (Sec 7.1) elicit physical-keyboard mental-model answers — key names like `K_QUOTE`, modifier-plane availability, base-layout collisions. Inverting the data flow to touch-first requires touch-first strategy variants that are not yet curated and would expand v1 scope materially. Mobile-first authoring is a known v1.1 work-item, not a silent gap.

**Decision 7 — Functional equivalence, not byte-identity.**
Decision: Round-trip is verified by *functional equivalence under `kmcmplib`*, not by byte-identity of the emitted `.kmn`. Two IRs are equivalent when every input in the bounded enumeration corpus (every virtual key x every modifier combination x deadkey paths up to depth 3) produces the same output character sequence under the WASM oracle. Order, whitespace, comment placement, and codepoint formatting differences are not defects.
Rationale: Byte-identity is unachievable across the corpus (mined `.kmn` files mix `dk()` and `deadkey()`, varying U+XXXX vs. literal forms, and free-form comment placement). Functional equivalence is the property authors and reviewers actually care about; it is mechanically checkable via the existing WASM oracle.

*Runtime justification for d=3 (ratified at #232):* The d=3 ceiling is binding on *runtime*, not combinatorics. At d=3 with a realistic 8-deadkey keyboard, the I2 corpus is ~7,680 inputs; at ~2 ms/input through the WASM oracle that totals ~15 seconds — at the outer edge of acceptable session-start latency. At d=4 the same keyboard balloons to ~61,440 inputs (~2 minutes), which is not tolerable. No real keyboard in `keymanapp/keyboards/release/` uses chains deeper than 2; d=3 gives one level of margin.

*Concurrency model:* I2 runs as an async job triggered on import and on every emit-gate, **outside** the 300 ms debounce cycle of decision D3. The debounce cycle is for keystroke feedback (TS-check + WASM oracle on the active rule); I2's full-corpus round-trip is too expensive to fit and is gated by import or emit, not by editing.

**Decision 8 — Opaque imports for unrecognized features.**
Decision: KMN features outside the typed IR — `save()`/`set()`/`reset()` option stores, `if()` over option stores, `call()`/`return()`, indexed `context(N)`, `outs()` store composition, SMP 5-digit `U+XXXXX` literals — are imported as `RawKmnFragment` IR nodes with `origin: 'imported'`. They render in the carve gallery as deletable cards; they are not survey-editable in v1. A lower-level raw-KMN editor is a v1.1 candidate.
Rationale: These features appear in a small fraction of `release/` keyboards and require substantial typed-IR work each. Treating them as opaque preserves round-trip fidelity (the emitter writes the original text back verbatim) and lets v1 import the long tail of `release/` keyboards without blocking on a complete typed model.

**Decision 9 — IR is canonical; original `.kmn` is a sidecar.**
Decision: Once a session exists, the KeyboardIR is the source of truth. The emitter always renders from the IR. The original `.kmn` (for imports beyond the US-English fallback) is preserved as a `<id>.kmn.imported` sidecar — included in the `.zip` and in the OAuth working tree for reviewer diff — but is **excluded from the PR commit**. This holds even when no edits are made: a no-edit import still emits a freshly-rendered `.kmn`.
Rationale: A two-source-of-truth model (IR + original text) drifts the moment any edit lands. Picking one canonical representation (the IR) makes the emitter, validator, and round-trip story all deterministic. The sidecar exists strictly for reviewer convenience during the v1 stabilization window and can be removed entirely in v1.1.
*Amendment (v1.1.1, D11):* The `.kmn.imported` sidecar is removed unconditionally. The PR-body import-attribution block and the HISTORY.md "Adapted from" bullet (D14) supersede it; the brittle path-suffix exclusion in `publishPR` goes away.

**Decision 10 — Recognizer rule format (v1.1).**
Decision: Pattern recognizer rules are TypeScript predicates owned by the engine. A YAML DSL for rules is deferred to v1.2 (tracked at #273).
Rationale: A TypeScript-predicate approach can ship within v1.1 without a new rule-compilation pipeline; the YAML DSL is a v1.2 affordance for content-team rule authoring.

**Decision 11 — `.kmn.imported` sidecar removal (v1.1).**
Decision: The `.kmn.imported` sidecar is removed unconditionally. Attribution is carried by the HISTORY.md "Adapted from `<sourcePath>`" bullet (mandatory) and the PR-body `buildImportAttributionBlock()` block (informational). The brittle path-suffix exclusion in `publishPR` is removed with it.
Rationale: The sidecar introduced a fragile exclusion rule in the output pipeline and duplicated attribution information already available in the PR body. The HISTORY.md bullet is a lighter, durable carrier; it survives in source control without special handling.

**Decision 12 — I2 bounded-enumeration corpus depth.**
Decision: Ratified at depth 3. Justified by WASM runtime (see D7 amendment above).
Rationale: See D7 runtime-justification paragraphs.

**Decision 13 — RawKmnFragment boundary (v1.1).**
Decision: The ratified v1.1 opaque categories are: `save/set/reset option-store`, `call/return`, `indexed context(n)`, `outs()`, and `SMP 5-digit literal`. Scanner-driven additions land as additive minor bumps (tracked at #237).
Rationale: These five categories cover the long tail of `release/` keyboards that cannot be fully typed in v1 without disproportionate IR complexity. The scanner (#237) will surface further candidates as data; each addition is additive (no breaking type change).

**Decision 14 — Import provenance attribution.**
Decision: `HISTORY.md` mandatory ("Adapted from `<sourcePath>`" bullet under the 1.0 entry); PR body informational (full block via `buildImportAttributionBlock()`); `LICENSE.md` only when the source licence requires it (e.g. CC-BY); `README.md` never.
Rationale: Attribution must survive in the committed source tree independent of the PR body (which is editable post-merge). HISTORY.md is the canonical carrier; the PR body is for reviewer context only. Keeping README.md clean avoids polluting the user-facing package description.

---

## 15. Acceptance scenarios

*Revised 2026-06-08 (v1.1.0 KeyboardIR import). See [docs/spec-amendment-2026-06-08-keyboardir.md](docs/spec-amendment-2026-06-08-keyboardir.md).*

### Scenario A: Latin QWERTY keyboard with a deadkey

**Starting state:** Studio open, no authentication, US-English fallback selected as the source. The carve gallery renders a pass-through view (no recognized patterns to suppress).
**User actions:** Phase A — enters language name "Tuvan", tag `tyv`, copyright holder "Researcher Name". Phase B — adapts the US-English base by adding characters `a e i o u` with acute accent variants. Phase C — selects the "tap then base letter" deadkey pattern; picks `K_QUOTE` as trigger key; lists base `aeiou` and accented `áéíóú`. Phase C' — NFD reorder auto-emitted. Phases D-G complete with defaults. Clicks "Download .zip".
**Expected output:** `.zip` containing a virtual FS that builds with `kmc build` with zero errors and zero warnings. `HISTORY.md` has a single `1.0` entry. `LICENSE.md` reads `Copyright © 2026 Researcher Name`. `welcome.htm` has `<html lang="tyv">`. `&CasedKeys` store present with `[K_A]..[K_Z]`.
**Pass criteria:** `kmc build` exit code 0, no diagnostics. Layer C green checks all pass. Typing `'a` in the live preview produces `a` with acute.

### Scenario B: Non-Roman Devanagari keyboard with pre-base vowel reorder

**Starting state:** Studio open; user selects a Devanagari base from `release/`.
**User actions:** Phase A — tag `hi`, group auto-detected as non-Roman / Indic. Phase B — adds Devanagari vowel matras to their target consonant keys. Phase C' — reorder gallery shown; user picks "pre-base vowels move before the consonant they attach to"; slot questions: pre-base vowels = `िा`, base consonants = `क..ह`, halant = `्`. Remaining phases complete with defaults.
**Expected output:** `.kmn` contains a `group(reorder)` with valid reorder rules for the filled slots. No `&CasedKeys` store (non-Roman default). Touch layout JSON validates against the schema. All Layer A checks pass.
**Pass criteria:** WASM oracle produces no errors. Typing a consonant followed by the pre-base vowel matra produces the correct visual display in the preview pane textarea.

### Scenario C: AZERTY base with AltGr layer

**Starting state:** Studio open; user selects a French base keyboard.
**User actions:** Phase A — tag `fr`, group auto-detected as AZERTY. Phase B — adds `@` on AltGr+A. Phase D — studio auto-inserts `usealtgr` tag in `.kvks`; modifier names normalized across `.kmn`/`.kvks`/`.keyman-touch-layout`. Phase G — submits via GitHub OAuth.
**Expected output:** Draft PR opened on fork; `.kvks` contains `usealtgr` tag; all three files use `RALT` / `rightalt` consistently. `&CasedKeys` store contains the AZERTY extended set. PR body lists green checks and no yellow flags for criteria modifier-consistency section.
**Pass criteria:** PR body present; no Layer A or Layer C errors in PR body. Local rebuild of the committed source with `kmc build` exits clean.

### Scenario D: Validator blocks invalid emission

**Starting state:** User is in Phase C; LLM emits a KMN fragment with an unresolved deadkey reference.
**User actions:** LLM maps slot answer to a deadkey name that does not match any registered deadkey (check #5 in the TS validator).
**Expected output:** Lint chip appears in the preview pane: "Deadkey 'foo' used in context but never defined as output." The survey blocks progression to the next phase. The compiler is not invoked. No partial `.kmn` is written to the virtual FS.
**Pass criteria:** Layer A TS check #5 fires before the WASM debounce cycle. Error message uses the text from `kmn-compiler-messages.ts`. User can edit their slot-fill answer and see the error clear in real time.

### Scenario E: criteria.md red-checklist appears at submit

**Starting state:** User completes all survey phases; their keyboard is a new submission (they are the original author).
**User actions:** Clicks "Submit via GitHub." Studio shows the pre-submit checklist.
**Expected output:** Red checklist includes: "I confirm I am the copyright holder or am authorized to submit on behalf of [copyright holder]." Green checks listed as auto-verified. Yellow items listed with the values the studio emitted (e.g. BCP47 tag, display name) for the reviewer's reference.
**Pass criteria:** No red item is pre-checked by the studio. User must check each red item manually before the "Confirm and submit" button becomes active.

### Scenario F: Adapting a country keyboard down to a single language

**Starting state:** Studio open; user selects `release/c/cm_qwerty` (a hypothetical multilingual Cameroonian QWERTY) from the source-selection browser. The codec parses it; the pattern recognizer lifts the Bafut deadkey family and the Fulfulde sequence-replace rules into recognized Patterns; remaining language families render in the carve gallery as deletable cards. The Layer A' I2 round-trip check passes; I5 reports two `RawKmnFragment` nodes (an `outs()` composition and a `save()` option store) as info-level entries.
**User actions:** Carve gallery — the user deletes the Fulfulde, Ewondo, and Duala rule families, keeping the Bafut Pattern intact. Phase A — sets `id = bfd_keyboard`, BCP47 = `bfd-Latn`, copyright = the language community organization. Phase B — confirms the Bafut character inventory pre-populated from the surviving rules; adds two characters the import missed. Phases C-G complete with defaults. Clicks "Submit via GitHub OAuth".
**Expected output:** Draft PR opened on the user's fork. PR body lists the import attribution (`adapted from release/c/cm_qwerty`, round-trip clean, two opaque features deleted as part of carving). `HISTORY.md` contains an "Adapted from `release/c/cm_qwerty`" bullet under the 1.0 entry. The PR commit does not contain a `.kmn.imported` sidecar (removed per D11).
**Pass criteria:** WASM oracle produces no errors. Layer A' I2 passes on every emit during the session. The committed `.kmn` builds with `kmc build` exit code 0. Re-importing the emitted `.kmn` into the studio produces an IR functionally equivalent to the one at submit time.

---

## 16. Out of scope

*Revised 2026-06-08 (v1.1.0 KeyboardIR import). See [docs/spec-amendment-2026-06-08-keyboardir.md](docs/spec-amendment-2026-06-08-keyboardir.md).*

- **Triage tool for traditional submissions** — a separate project that reuses `@keymanapp/kmn-validator` and `@keymanapp/keyboard-lint`; not part of keyboard-studio.
- **LDML output** — deferred until the LDML-to-touch build path lands in the Keyman toolchain. Emission format is locked to KMN + `.keyman-touch-layout`.
- **Mobile-app integration** — `oem/` updates, partner CSV updates, partner-organization bundle workflows.
- **Touch-first authoring path** — v1 supports desktop-first authoring only (Decision 6, Sec 14). The survey, strategy selector, and gallery are anchored to physical-keyboard mental-model answers; the touch layout is scaffolded from the desktop OSK in Phase E with no reverse derivation. Mobile-primary authors are surfaced this at Phase A and may continue with the desktop-first flow (still receiving a derived touch layout). Touch-first authoring is a v1.1 candidate.
- **Hosting and deployment** — infrastructure is left to the operator; this project ships a static SPA.
- **CJK, Ethiopic, and Hangul/jamo cluster-assembly in v1** — confirmed excluded; see Sec 14, decision 5. CJK (Han-based scripts) and Ethiopic are excluded due to incomplete specialist curation; Hangul is excluded because jamo-to-syllable cluster composition (Dubeolsik/Sebeolsik stateful composition) is a distinct complexity class with no jamo composition pattern in the library. Target: sprint 2 pattern-library work.
- **Multi-language `welcome.htm` variants** — LLM-generated variants for multiple languages; post-v1.
- **`.kpj.user` or build-folder management beyond what the scaffolder strips** — cleanup is one-time at scaffold time.
- **Predictive text / wordlists (`.model.ts`)** — the strategy catalog (Sec 7) covers input rules only; lexical models are a separate artifact, post-v1. (A pasted text sample *is* used in Phase B for **character discovery** — enumerating which characters the keyboard must support — which is in scope, Sec 8. Only the wordlist / frequency *model* is deferred.)
- **Migration of legacy binary keyboards** — the studio authors from KMN sources; it does not import compiled `.kmx`/`.kmn` binaries.
- **Multi-source merge** — v1 adapts exactly one source keyboard per session (US-English fallback, a `release/` keyboard, or one upload). Combining rules from two sources (e.g. taking deadkeys from one keyboard and a touch layout from another) is not supported. Authors adapting a language covered by overlapping country keyboards pick the closest single source and carve it down.
- **Survey-editing opaque IR fragments** — `RawKmnFragment` nodes (D8) appear in the carve gallery as deletable cards but cannot be edited through the survey in v1. A lower-level raw-KMN editor is a v1.1 candidate.
- **Byte-identical round-trip** — round-trip is verified by functional equivalence under `kmcmplib` (D7), not by byte-for-byte preservation of the original `.kmn` text. Whitespace, store ordering, comment placement, and codepoint formatting may change between import and emit.

Note: touch/mobile layouts and `.kmp`/`.kvks`/`.keyboard_info` generation are **in** scope (Phases E, D, G) — the strategy framework (Sec 7) was originally drafted physical-keyboard-only, but in the studio it is the desktop-rule layer of the full pipeline (see Sec 7 scope note).

---

## 17. Glossary

*Revised 2026-06-08 (v1.1.0 KeyboardIR import). See [docs/spec-amendment-2026-06-08-keyboardir.md](docs/spec-amendment-2026-06-08-keyboardir.md).*

**adapting author.** A user-mode the studio supports as a first-class case: an author starting from an existing `release/` keyboard rather than from the US-English fallback. The flow is the same as the primary user-mode; only the source of the IR differs. See §3.

**BCP47.** Internet standard tag format for identifying human languages and scripts. Example: `tyv` (Tuvan), `hi-Deva` (Hindi in Devanagari script). Used throughout for language and script identification.

**carve gallery.** The card-view UI that renders an imported IR's rules, stores, groups, touch keys, and recognized Patterns as keep/edit/delete cards. The author carves unwanted material away before the Phase A survey begins. See §4, §8.

**CasedKeys (`&CasedKeys`).** A Keyman system store declaring the set of virtual keys that participate in `CAPS`/`NCAPS` modifier logic. Scaffold inserts the appropriate set per script group; non-Roman scripts default to omitting it.

**deadkey.** A KMN mechanism in which pressing a key emits no character immediately but sets a named state that modifies the next keystroke. Written as `deadkey(name)` in KMN context positions; `dk()` is a synonym.

**decision tree.** The ordered rule set (Sec 7.2) that maps a keyboard's discovery-axis values to a primary output strategy (S-01..S-12) plus secondaries. The strategy selector runs it; its output drives which gallery patterns are shown.

**functional equivalence.** Round-trip criterion (Decision 7, §14): two IRs are equivalent when, for every input in the bounded enumeration corpus (every virtual key x every modifier x deadkey paths up to depth 3), the WASM oracle produces the same output character sequence from both.

**discovery axis.** One of the seven dimensions (A1–A7, Sec 7.1) the survey computes to describe a keyboard's input-method needs (scale, script class, phonetic intuition, diacritic behavior, multi-mode, constraint enforcement, spare-key availability). The axis vector is the decision tree's input.

**identity propagation.** The scaffolder step that resets the base keyboard's identifier fields — keyboard name, BCP47 language tag, copyright line, and version — to values for the new keyboard being authored. Prevents base-keyboard metadata from appearing in the submitted keyboard.

**KeyboardIR (IR).** The typed in-memory representation of a keyboard. Once a session exists in the studio, the IR is the source of truth (Decision 9, §14); the emitter renders the final `.kmn` from the IR. See §5a.

**kmnFragment.** The KMN rule text embedded in a Pattern record, containing `{{slotId}}` placeholders that the scaffolder replaces with user-supplied values.

**Layer A / Layer B / Layer C.** The three validation layers in the lint engine. Layer A: structural and semantic validity (14 compiler checks). Layer B: style and canonical form (TS AST rules). Layer C: repo hygiene against criteria.md checkpoints. See Sec 10 for details.

**NCAPS.** A Keyman modifier keyword that suppresses `CAPS LOCK` behavior on a rule. A known scaffolding hygiene issue is leftover `NCAPS` modifiers in base keyboards that should be stripped.

**pattern recognizer.** The engine + content component that walks an imported IR, lifts node clusters matching curated recognizer rules into `Pattern` instances with `origin: 'recognized'`, and back-references the lifted nodes via `Pattern.ownedNodes`. See §4, §8.

**OAuth.** Open Authorization. The protocol used for GitHub authentication in the studio's fork+PR delivery path. The studio requests `public_repo` scope only.

**slot.** A named placeholder in a `kmnFragment` (written `{{slotId}}`). Each slot corresponds to a `PatternQuestion` whose answer is substituted at scaffolding time.

**store.** A KMN named sequence of characters or virtual keys, declared with `store(name) '...'`. Stores are referenced in rules via `any(name)` and `index(name, N)`.

**RawKmnFragment.** An IR node holding KMN syntax that the codec could not map to a typed IR node (e.g. `save()`/`set()`, `call()`, `outs()`, SMP 5-digit literals). Round-trips verbatim; rendered as a deletable card in the carve gallery; not survey-editable in v1. See Decision 8, §14.

**strategy card / strategy ID.** A strategy card (Sec 7.3) is a self-contained, citable description of one `.kmn` output method, identified by a strategy ID (`S-01`..`S-12`). A `Pattern` (Sec 5) names the card it implements via its `strategyId` field.

**virtual FS.** The in-memory filesystem the scaffolder builds during authoring. Mirrors the directory structure expected by `keymanapp/keyboards`. Serialized to `.zip` for download or committed directly for the OAuth PR path.

**WASM.** WebAssembly. The binary format used to run `kmcmplib` (the Keyman compiler) in-browser. Enables 100-300 ms warm recompile without a server round-trip.

---

## 18. Revision policy

*Revised 2026-06-08 (v1.1.0 KeyboardIR import). See [docs/spec-amendment-2026-06-08-keyboardir.md](docs/spec-amendment-2026-06-08-keyboardir.md).*

This spec evolves via explicit revision requests tracked in the keyboard-studio issue tracker. Changes to prose sections (data flow, scenarios, out-of-scope list) may be made by the spec maintainer following a single-reviewer approval. Changes to the Pattern schema (Sec 5) require a joint engine+content session (the same threshold as the Day-1 contract lock); breaking field changes — renames, type changes, removals — require a major version bump of the `Pattern` interface and a corresponding update to `packages/contracts`. Changes to resolved decisions in Sec 14 require an explicit revision request citing the original decision and the new evidence; they may not be re-opened informally. The following items are tracked for a v1.1 revision cycle and are not in scope for v1: risk and dependencies section, performance targets table, and accessibility section.

Changes to the KeyboardIR schema (§5a) — field renames, type changes, removals — follow the same policy as the Pattern schema: joint engine+content session required; breaking changes require a major version bump of `packages/contracts`. Adding new typed nodes for features currently held as `RawKmnFragment` (Decision 8, §14) is a minor revision, not a breaking change.

---

## 19. Reference

*Revised 2026-06-08 (v1.1.0 KeyboardIR import). See [docs/spec-amendment-2026-06-08-keyboardir.md](docs/spec-amendment-2026-06-08-keyboardir.md).*

| Document | Location |
|---|---|
| Authoring plan and component architecture | `docs/KM-Questionnaire.md` in the keyboard-studio repo, or https://github.com/MattGyverLee/keyboard-studio/blob/main/docs/KM-Questionnaire.md |
| Validator / lint architecture (14 compiler checks) | `docs/lint.md` in the keyboard-studio repo, or https://github.com/MattGyverLee/keyboard-studio/blob/main/docs/lint.md |
| PR review criteria (~200 checkpoints, green/yellow/red) | `docs/criteria.md` in the keyboard-studio repo, or https://github.com/MattGyverLee/keyboard-studio/blob/main/docs/criteria.md |
| Template-cleanup recipe (scaffolder source of truth) | `docs/making-a-template.md` in the keyboard-studio repo, or https://github.com/MattGyverLee/keyboard-studio/blob/main/docs/making-a-template.md |
| `.kmn` strategy framework (discovery axes, decision tree, strategy cards S-01..S-12) | Merged into Sec 7 of this spec. `strategy tree/strategies.md` is retained only as a stub pointer — do not treat it as a separate source. |
| GitHub repository | https://github.com/MattGyverLee/keyboard-studio |
| Issue tracker | https://github.com/MattGyverLee/keyboard-studio/issues |
| KeyboardIR schema (full TypeScript) | `packages/contracts/src/keyboard-ir.ts` |
| Import corpus / supportability matrix | `docs/import-corpus.md` (generated by the supportability scanner) |
| ParseKB prior art (Python, separate repo) | `D:\Github\_Projects\_KM\ParseKB` — informs codec design; not a dependency |

Issues #5, #6, #8, and #31 are the critical-path items. Do not reference individual issues in shipped code comments; cross-link via commit messages and PR bodies.

This spec is maintained under the revision policy in Sec 18. The next scheduled review is at the Day-4 integration milestone (issue #31).

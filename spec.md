# keyboard-studio — Spec

**Repository:** https://github.com/MattGyverLee/keyboard-studio
**Date:** 2026-06-02
**Status:** Draft — pre-Day-1 sync

---

## Table of Contents

1. [Elevator pitch](#1-elevator-pitch)
2. [Why this exists](#2-why-this-exists)
3. [Target user](#3-target-user)
4. [System overview](#4-system-overview)
5. [Pattern schema](#5-pattern-schema)
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

**Problem.** Language experts who want to submit a keyboard to `keymanapp/keyboards` must either learn `.kmn` syntax themselves or find a Keyman Developer-fluent collaborator. Most language workers cannot ship without external help; keyboard repository reviewers spend significant time correcting the same mechanical hygiene mistakes across dozens of PRs.

**Solution.** Keyboard-Studio is a browser-based authoring environment that lets language experts — people who know their language's phonology, orthography, and character inventory but have never written a Keyman keyboard — create production-ready Keyman keyboards without touching `.kmn` syntax. Users answer plain-language questions and choose from live-demoed interaction patterns. The system compiles in-browser in 100-300 ms per edit using the existing `kmcmplib` WebAssembly (WASM) binary, validates every emission against a real language-aware lint engine, scaffolds a touch layout automatically from desktop rules, and enforces all mechanical criteria by construction.

**Delivery.** A finished keyboard is delivered either as a downloadable `.zip` or via GitHub Open Authorization (OAuth) fork-and-draft-PR directly to `keymanapp/keyboards`.

---

## 2. Why this exists

Language experts who want to submit a keyboard to `keymanapp/keyboards` today face every one of these barriers:

- Writing `.kmn` rules requires knowledge of virtual-key names, store declarations, deadkey syntax, group structure, and modifier semantics.
- A complete submission requires producing and keeping consistent: `.kpj`, `.kps`, `.kvks`, `.keyman-touch-layout`, `HISTORY.md`, `LICENSE.md`, `README.md`, `welcome.htm`, and `help/<name>.php`.
- Generating a touch layout from desktop rules is a manual, error-prone step.
- Satisfying the ~200 PR-review criteria in `criteria.md` requires both domain knowledge and Keyman-specific familiarity.
- In practice, reviewers silently fix the same hygiene mistakes across dozens of PRs: missing `usealtgr` tag, wrong `Copyright ©` syntax, `NCAPS` leftovers, blank `.kvks`, `welcome.htm`/`.php` body drift.

Keyboard-Studio removes every mechanical barrier: the scaffolder enforces all green criteria by construction, the survey surfaces yellow criteria in plain language, and the validator blocks invalid output before it ever reaches the compiler.

---

## 3. Target user

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

---

## 4. System overview

```
keyboard-studio
|
+-- base-keyboard browser      [engine]   GitHub API client; filters keymanapp/keyboards/release/;
|                                         offline fallback US-English bundle.
|
+-- project scaffolder         [engine]   Duplicates base into virtual FS (see Glossary); applies
|                                         template-cleanup pipeline (NCAPS strip, [CAPS] deletion,
|                                         &CasedKeys insertion, touch-layout cleanup); enforces
|                                         identity propagation (plain-language: resets keyboard
|                                         name, BCP47 tag, copyright, and version to match the
|                                         new keyboard being authored).
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
|
+-- compiler service (WASM)    [engine]   kmcmplib loaded once; warm recompile 100-300 ms; produces
|                                         .kmx + .kvk + .js + .keyman-touch-layout blob URLs.
|
+-- output / submit            [engine]   Download .zip (no auth) OR GitHub OAuth fork+draft PR
                                          (PR body auto-generated from lint results).
```

---

## 5. Pattern schema

This schema is the Day-1 contract. Any change to field names or types requires a joint session (issue #5). Breaking changes to the `Pattern` interface require a major version bump (see Sec 18). The optional `strategyId` and `combinesWith` fields are **proposed** additions that link each pattern to the strategy catalog (Sec 7); they are non-breaking (optional) but, per the same policy, are not locked until the Day-1 #5 session ratifies them.

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
```

`StrategyId` is the union `'S-01' | 'S-02' | ... | 'S-12'` exported from `@keyboard-studio/contracts`; see §7.3 for the strategy catalog.

**`appliesTo` semantics.** An empty array (`[]`) means the pattern is unrestricted and will be offered to all script groups. A non-empty array lists BCP47 script subtags (e.g. `"Latn"`, `"Deva"`) or base-keyboard IDs; the pattern is then offered only to projects matching at least one listed value.

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

Character coverage is **not** "simple substitution." Choosing how a character is output — a bare key swap, a deadkey-then-base composition, an ASCII transliteration, a tone cycle, a context-sensitive cluster, an OS IME callout — is the core decision the studio makes for the user. This section is that recommendation engine.

The survey does not emit output rules directly. It computes a seven-axis description of the keyboard's needs (Sec 7.1), runs a decision tree over those axes (Sec 7.2) to choose a **primary output strategy** (one of S-01..S-12) plus likely **secondaries**, and surfaces the matching gallery patterns for the user to confirm by example. The pattern library (Sec 5) is the implementation layer: each `Pattern` names the strategy it implements via `strategyId`, so a decision-tree result maps directly to the patterns the gallery shows first.

**Scope note.** The strategy catalog (Sec 7.3) describes **physical-keyboard (desktop) KMN rules**. Touch counterparts are produced from each pattern's `touchLayoutFragment` and Phase E (Sec 8); packaging from Phase G. The catalog is the desktop-rule layer of the fuller v1 pipeline — not a separate, narrower product. (The strategy framework was originally drafted physical-keyboard-only; in the studio it is embedded in the full touch + packaging flow.) v1 is desktop-first by design (Decision 6, Sec 14); touch-first authoring is a v1.1 candidate.

### 7.1 Discovery axes

Seven dimensions describe a keyboard-design need well enough to pick a strategy. Each is a value the **survey** computes — there is no separate interview script. The last column gives the survey phase that elicits the axis and the plain-language question used.

| # | Axis | Allowed values | Meaning & survey elicitation |
|---|------|----------------|------------------------------|
| A1 | **Scale** | tiny (<5) / small (5–20) / medium (20–100) / large (100–300) / massive (1000+) | How many *new* characters the keyboard adds beyond a stock physical layout. **Phase B:** "Roughly how many new characters does your keyboard need — ones not already on a standard physical keyboard?" |
| A2 | **Script class** | alphabetic / abugida / abjad / syllabary / logographic | Structural class of the writing system; drives one-char-per-key vs. cluster-shaped output. **Phase A** (Three-group routing, Sec 9) detects this from the BCP47 script subtag + base; confirmed in plain language: "What writing system does the keyboard produce?" |
| A3 | **Phonetic intuition** | strong / weak | Strong = the user thinks "I'd type a Latin spelling of the sound." Weak = mapping is shape- or modifier-based. **Phase B/C:** "When you picture typing a special character — type the Latin spelling of the sound, or press a key that looks like it / a modifier + base key?" |
| A4 | **Diacritic behavior** | none / stacking-combining / replacing-cycling / multi-family | How marks behave on a base. Cycling = a repeated mark key replaces the previous mark (Vietnamese-style). **Phase B/C:** "Do your characters have accent marks or tones — none, stacking, tone marks that replace on a second press, or many different accent families used together?" |
| A5 | **Multi-mode** | single / two-orthography | Whether the keyboard exposes a runtime toggle between two orthographic styles (e.g. dotted vs. bar-under Yoruba). **Phase A/C:** "Does your language have more than one written form users switch between?" |
| A6 | **Constraint enforcement** | none / soft / loud | What happens on an invalid sequence. Loud = audible beep; soft = silent suppression. **Phase C:** "Should the keyboard reject obviously invalid input — no, silently, or with a beep?" |
| A7 | **Spare-key availability** | many / RAlt only / fully booked | How crowded the base layout is; fully booked → need a modifier plane. **Phase B:** "What's the physical base layout, and does it have unused keys?" |

**A2a — cluster sensitivity (abugida/abjad only).** If A2 is abugida or abjad, one follow-up resolves whether output depends on prior context (Arabic positional forms, Indic reph/conjuncts, syllabary ligatures): "Does the keyboard need to choose different output based on what was typed before?" Yes → clusters needed; No → clusters not needed. The answer gates decision rule 2 (Sec 7.2).

**A7a — full-remap detection (alphabetic only).** If A2 is alphabetic, one follow-up resolves the keyboard's posture toward the base layout: "Will the keys on your keyboard mostly show the same letters as the base layout (with just a few additions or changes), or will every key display a different letter?" Full-remap → every key reassigned (Russian/Armenian/Greek mnemonic style); addition → most base keys unchanged (Akan-style additive layout). The answer gates the new decision rule 8 (Sec 7.2). For Latin-target alphabetic keyboards on a Latin base, the answer defaults to addition; non-Latin alphabetic targets on a Latin base (Cyrillic, Armenian, Greek, Coptic, Cherokee, Adlam, etc.) are the typical full-remap case.

### 7.2 Decision tree

Ordered rules. The first matching rule fixes the **primary** strategy; rules 9–10 add **secondaries**; rule 11 is a late-primary fallback for tiny phonetic additions; rule 12 is the catch-all fallback.

| # | Condition | Primary | Add secondaries |
|---|-----------|---------|-----------------|
| 1 | A1=massive AND A2=logographic | **S-12** DLL IME callout | — |
| 2 | A2=abjad OR (A2=abugida AND cluster sensitivity=yes) | **S-09** Context-sensitive cluster | + S-05 if A3=strong |
| 3 | A4=replacing-cycling | **S-07** Diacritic cycle | + S-04 |
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

1. **Primary-fixing pass.** Try rules 1-8 in order; the first matching rule sets `primary`. If none of 1-8 match, try rule 11 (`A1=tiny AND A3=strong`); if it matches, primary is S-01. Otherwise rule 12 (catch-all) sets primary to S-03.
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
    R3 -- no --> R4{A5=two-orthography?}
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
    class S01,S02,S03,S05,S06,S06full,S07,S09,S11,S12 primary
    class Add08,Add10 addon
    class R1,R2,R3,R4,R5,R6,R7,R8,R9,R10,R11,Sec decision
```

**Prose summary.** Massive logographic → only the OS IME is fast enough; delegate (S-12). Indic/Arabic-shaped scripts need context-aware cluster rules (S-09); phonetic ones add mnemonic spelling. Tonal cycling (S-07) is neither stacking nor deadkey. Dual orthography (S-11) wraps a state toggle around the inner strategy. Big phonetic alphabets (S-05) — let the user type spellings, collapsed with `any`/`index`. Big diacritic palettes (S-06) — two-tier deadkey: first key picks the family, second the base. Small accent-heavy Latin (S-02) — classic deadkey composition. Non-Latin alphabetic full-remap (Russian/Armenian/Greek mnemonic) — chained deadkeys for case-and-diacritic alternates (S-06) plus an RAlt modifier plane (S-08) for the lesser-used letters. Loud feedback (S-10) and fully-booked layouts (S-08) are add-ons, never the whole answer. A handful of phonetic additions (S-01) — just swap them in. Otherwise (S-03) — short ASCII sequences expand to single chars.

**Encoding.** The tree may be encoded as JSON/TS rules in `packages/contracts` or reasoned over by the LLM directly against this table; both are valid (pick per studio architecture). The strategy selector returns `{ primary: strategyId, secondaries: strategyId[] }`, which the gallery resolves to patterns via the `strategyId` / `combinesWith` fields (Sec 5).

### 7.3 Strategy catalog (S-01..S-12)

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

| Exemplar | A1 | A2 | A3 | A4 | A5 | A6 | A7 | A7a | Tree → strategy | Actual primary |
|----------|----|----|----|----|----|----|----|-----|-----------------|----------------|
| `release/a/akan/` | tiny | alphabetic | strong | none | single | none | many | addition | rule 11 → S-01 | S-01 ✓ |
| `release/sil/sil_euro_latin/` | large | alphabetic | strong | multi-family | single | none | RAlt only | addition | rule 6 → S-06 | S-02 + S-04/S-08 ✗ |
| `release/sil/sil_ipa/` | medium | alphabetic | strong | none | single | none | many | addition | rule 5 → S-05 + S-04 | S-03 + S-04 ✗ |
| `release/sil/sil_devanagari_phonetic/` | medium | abugida | strong | none | single | none | many | — | rule 2 → S-09 + S-05 | S-09 + S-05 ✓ |
| `release/v/vietnamese_telex/` | medium | alphabetic | strong | replacing-cycling | single | none | many | addition | rule 3 → S-07 + S-04 | S-07 ✓ |
| `release/sil/sil_yoruba8/` | medium | alphabetic | strong | multi-family | two-orthography | none | many | addition | rule 4 → S-11 wrap | S-11 ✓ |
| `release/a/armenian_mnemonic_r/` | medium | alphabetic | weak | none | single | none | RAlt only | full-remap | rule 8 → S-06 + S-04 + S-08 | S-06 + S-04 + S-08 ✓ |
| `release/el/el_pasifika/` | small | alphabetic | strong | stacking-combining | single | loud | many | addition | rule 7 → S-02 + rule 9 → +S-10 | S-02 + S-10 ✓ |
| `release/c/cs_pinyin/` | massive | logographic | weak | none | single | none | many | — | rule 1 → S-12 | S-12 ✓ |
| `release/itrans/itrans_devanagari_hindi/` | large | abugida | strong | none | two-orthography | none | many | — | rule 2 → S-09 + S-05; rule 4 wraps S-11 | S-09 + S-05 + S-11 ✓ |
| `release/sil/sil_pan_africa_mnemonic/` | large | alphabetic | weak | multi-family | single | none | many | addition | rule 6 → S-06 + S-04 | S-06 + S-04 ✓ |
| `release/a/arabic_izza/` | medium | abjad | weak | none | single | none | many | — | rule 2 → S-09 | S-09 ✓ |
| `release/r/russian_mnemonic_r/` | medium | alphabetic | weak | none | single | none | RAlt only | full-remap | rule 8 → S-06 + S-04 + S-08 | S-06 + S-04 + S-08 ✓ |

Note: S-04 (`any`/`index` table mechanism) is structurally embedded in every S-06 deployment; rows that list S-06 implicitly include S-04.

**Known mismatches (intended v1.1 work, not bugs).** Rule 8 (added in v1.0.1) closed the alphabetic full-remap gap; Armenian and Russian mnemonic now round-trip correctly. Two exemplars still don't round-trip; each marks a tree gap to fix in v1.1:

- **EuroLatin**: A2=alphabetic, A1=large, A4=multi-family, A3=strong, A7a=addition. Tree picks **S-06 (two-tier chained deadkeys)** but the actual keyboard uses **S-02 with broad parallel stores**. Add an A3-and-scale tie-breaker inside rule 6 that prefers S-02 + broad S-04 over S-06 when the diacritic families are independent rather than nested.
- **IPA**: A3=strong but the user prefers *sequence modifiers* (`<`, `=`, `>`) to mnemonic spelling. Add a sub-axis distinguishing "spell the sound" from "decorate with suffix keys."

These two remaining mismatches are **the value of the validation pass** — they pinpoint where v1 needs work before release. They are not v1 blockers: EuroLatin and IPA are expert-authored, well outside the target user's profile, and the strategies the tree picks (S-06 for EuroLatin, S-05 for IPA) produce working keyboards even if they differ from what SIL chose.

---

## 8. Data flow

1. **Base selection.** User opens studio; base-keyboard browser fetches `keymanapp/keyboards` index via GitHub API, highlights `release/basic/` as the default pool. User picks a base (or accepts US-English fallback).

2. **Scaffolding.** Project scaffolder duplicates the chosen base into an in-memory virtual FS, applies the full template-cleanup pipeline (identity reset, NCAPS strip, `[CAPS]` deletion, `&CasedKeys` insertion, touch-layout cleanup), and runs Layer C hygiene. The scaffolded project is clean-by-construction before the user touches anything.

3. **Survey — Phase A (Identity + routing).** User enters language name, localized language name (autonym), BCP47 tag (with langtags.json lookup), display name, copyright holder. System detects script group (QWERTY/QWERTZ, AZERTY, or non-Roman) from BCP47 + base choice and confirms with the user. This routes all subsequent phases. Phase A also surfaces v1's desktop-first authoring posture (Decision 6, Sec 14) — mobile-primary authors are notified that the survey is anchored to physical-keyboard mental-model answers before they invest survey time. The touch layout is still produced in Phase E. Phase A optionally collects **provenance metadata** (`KeyboardProvenance` in `@keyboard-studio/contracts`) — requester identity and contact, language-community representative, speaker count, language status, regions, existing tools, orthography link, casing notes, and free-form notes (the intake fields carried over from the legacy manual request form). Provenance is **non-gating**: it never blocks a phase exit or the submit button, and is serialized into the package / PR body for attribution and contact at output (Sec 12), never into the `.kmn`. The localized name is the one provenance field that may also feed a build artifact (the `.kps` / `welcome.htm` display). This is metadata capture only — it is distinct from the out-of-scope triage tool (Sec 16) and implies no request queue or assignment workflow.

4. **Survey — Phase B (Character coverage + strategy axes).** User pastes or lists target characters. Studio diffs against the base keyboard output set and, for each new character, the user states which key it lives on and under what modifier. Crucially, this phase also **computes the discovery axes** (Sec 7.1): the character count fixes A1 (scale), the diff and a few plain-language follow-ups fix A3 (phonetic intuition), A4 (diacritic behavior), and A7 (spare-key availability). The output method is **not** assumed to be simple substitution — Phase B feeds the axis vector to the strategy selector (Sec 7.2), which picks the right strategy. A simple one-key-per-character swap (S-01) is only the result when the inventory is tiny and phonetic; larger or diacritic-heavy inventories route to deadkey composition (S-02), mnemonic spelling (S-05), diacritic cycling (S-07), context-sensitive clusters (S-09), and so on.

To seed this phase the studio offers several **character-discovery** methods (`CharacterDiscoveryService`). No single source is assumed available, so the methods are complementary and the inventory may be built from any combination:

- **Manual** — list the characters by hand. Always available.
- **Text sample** — paste a corpus; the studio grapheme-segments it, ranks the distinct characters by frequency, and diffs them against the base output set.
- **Linguist agent** (the orthography / authoritative-source method) — given the language name + BCP47 tag, an LLM linguist agent synthesizes a structured, NFC-normalized inventory from CLDR `exemplarCharacters` cross-referenced with orthography references (language academies, Omniglot, trusted corpora). It returns core and auxiliary alphabets (with case pairs), mandatory diacritic/ligature bundles, language-specific punctuation, and numerals — usually the single most reliable signal for which characters a language needs. A **deterministic CLDR cross-check** then flags divergences (a character the agent added that CLDR/orthography don't attest; a CLDR-attested character the agent dropped), and the result is presented to the user for confirmation — never trusted silently. The prompt template lives in `docs/prompts/character-inventory-linguist.md`; the structured result is the `LinguistInventory` contract type.
- **Visual picker** — browse a script-scoped grid (seeded from the language's CLDR exemplar characters, falling back to the script's Unicode block) and click the characters to include. This is the fallback when the author has neither text nor a language the agent can resolve.

Whatever the method, the result pre-fills the target-character inventory, which the user confirms or edits; the strategy selector (Sec 7.2) then runs over the confirmed set. Discovery is **character enumeration only** — no wordlist or prediction model is built (Sec 16); frequency, where a method provides it, is advisory and may hint key placement. (The picker and the linguist agent's cross-check reuse the same pinned Unicode/CLDR signal as the kbgen placement seeder.) **Normalization note:** the linguist inventory is NFC for character identification and display; how the keyboard normalizes its *output* (e.g. the NFD reorder auto-emitted for Latin groups in Phase C' below) is a separate, later concern and is not constrained by the inventory's NFC form.

5. **Gallery — Phase C (Special inputs).** Driven by the strategy selector's result (primary + secondaries, Sec 7.2). The gallery surfaces the **recommended strategy's** patterns first as live mini-keyboards (e.g. a deadkey demo for S-02, a tone-cycle demo for S-07); secondary and less-common strategies sit behind "show me more." This phase also resolves the remaining axes that need a judgment call — A5 (multi-mode), A6 (constraint enforcement), and A2a (cluster sensitivity) — which can add S-11, S-10, or S-09 to the recommendation. User taps each demo, confirms the ones that match their language, and fills plain-language slot questions. Each selected pattern is inserted as a validated KMN skeleton tagged with its `strategyId`.

6. **Gallery/auto — Phase C' (Reordering).** (C-prime.) QWERTY/QWERTZ and AZERTY groups get NFD normalization auto-emitted unless the base already has a reorder scheme. Non-Roman groups see a curated reorder gallery (pre-base vowel, halant/conjunct, tone-mark, subscript stacking) and pick the pattern matching their script family.

7. **Auto + survey — Phase D (OSK desktop).** OSK `.kvks` is auto-populated from rule output; modifier-name consistency enforced across `.kmn`/`.kvks`/`.keyman-touch-layout`; `usealtgr` tag auto-inserted when `RALT` is present. Survey intervenes only when modifier-naming intent is ambiguous.

8. **Gallery — Phase E (Touch layout).** Touch layout JSON scaffolded from desktop KVK via modifier-to-layer mapping. User sees touch-feature galleries (longpress menus, layer switching, flicks, multitap) as live tappable demos and enables those that fit their language. Output validated against the touch-layout JSON schema.

9. **Survey — Phase F (Help docs).** `welcome.htm` generated from template (BCP47 lang attr from Phase A, no version, no copyright). User writes descriptive content; `help/<name>.php` regenerated deterministically from the same content, guaranteeing body+style parity.

10. **Auto — Phase G (Package).** `.kps` pre-populated: `LICENSE.md` as license file (avoids `KM0900A`), "Follow keyboard version" set, language tags from Phase A, Files block matches `targets`.

11. **Live preview.** Every edit triggers a 300 ms debounce; kmcmplib compiles to blob URLs; KeymanWeb reloads with the new keyboard; lint chips appear for any diagnostics. Submit button is blocked until zero warnings.

12. **Lint and validate.** Layer A (validity) + Layer B (style) run on every edit; Layer C (hygiene) runs on each phase exit and at submit. Green checks pass silently; yellow checks surface as survey questions at the relevant phase; red checks appear as a final checklist before PR submission.

13. **Output.** User chooses download `.zip` (virtual FS serialized, readme on next steps, no auth required) or GitHub OAuth fork+draft PR (fork `keymanapp/keyboards`, branch `add/<id>`, commit virtual FS, open draft PR with auto-generated body listing green checks passed, yellow items by criteria section, red items as a final checklist, plus copyright attestation).

---

## 9. Three-group routing

The survey branches at Phase A based on BCP47 tag, base-keyboard choice, and user confirmation. The three groups share the same phase structure but differ in authoring emphasis, reordering load, and `&CasedKeys` content.

| Group | Typical bases | Primary challenges | CasedKeys default | Reorder posture |
|---|---|---|---|---|
| QWERTY / QWERTZ | `release/basic/*`, English/German-family | Character substitution, diacritics via deadkeys, occasional RALT/AltGr | `[K_A]..[K_Z]` | NFD normalization; auto-emitted unless base has its own scheme |
| AZERTY | French/Francophone-Africa bases | Position remapping (Q<->A, W<->Z), shifted digits, heavy AltGr layer | `[K_A]..[K_Z] [K_0]..[K_9] [K_HYPHEN] [K_EQUAL] [K_LBRKT] [K_RBRKT] [K_BKSLASH] [K_QUOTE] [K_COMMA] [K_PERIOD] [K_SLASH] [K_COLON]` | NFD normalization; auto-emitted unless base has its own scheme |
| Non-Roman | Curated bases per script family (Indic, Arabic, Hebrew, SEA, etc.) | Character mapping, heavy reordering, script-specific OSK conventions | Typically omitted; survey confirms per script (see decision in Sec 14) | Gallery-picked: pre-base vowel, halant/conjunct, tone-mark, subscript stacking |

**Routing decision.** Group is detected automatically from the BCP47 script subtag and the chosen base keyboard, then confirmed with the user in a single plain-language step before the survey continues. Non-Roman group is further sub-routed to a script-family branch (Indic, Arabic, SEA, etc.) that controls which reorder patterns are shown in Phase C'.

The three groups are the coarse expression of discovery axis **A2 (script class, Sec 7.1)**: QWERTY/QWERTZ and AZERTY are both *alphabetic*; the Non-Roman group spans *abugida / abjad / syllabary / logographic*, which the strategy selector then refines (e.g. abugida + cluster sensitivity → S-09). Routing narrows the field; the decision tree (Sec 7.2) picks the specific output strategy within it.

**Reorder priority order.** (1) Adopt the base keyboard's existing reorder scheme if present. (2) Otherwise, for QWERTY/QWERTZ and AZERTY, auto-emit a standard NFD-normalization `group(reorder)`. (3) For non-Roman, present the curated reorder pattern gallery; user picks the pattern matching their script's behavior. The LLM maps user intent to slot values; it does not author group chains from scratch.

**CJK and Ethiopic — v1 exclusion.** CJK and Ethiopic script families are acknowledged members of the Non-Roman group but are excluded from v1. Their reorder patterns require specialist curation not yet complete. The gallery renders a "not yet supported" stub for these scripts rather than an empty gallery, so users receive a clear explanation rather than a silent gap.

---

## 10. Validator and lint engine

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
| layer-c-enforce | 58 | "BCP47 tag well-formed; modifier names consistent across `.kmn`/`.kvks`/`.keyman-touch-layout`" | Layer C lint engine; blocks phase progression on `error`. |
| yellow-survey | 33 | "BCP47 tag is correct for the language/script" — requires langtags.json lookup and linguistic judgment | Phase A survey asks for the tag; studio cross-checks against langtags.json and flags mismatches for user review. |
| red-checklist | 4 | "If a third party submits a patch to an existing keyboard, original author was consulted" — requires direct author communication | Final checklist item in PR submission flow; PR body includes a reminder block. |

Source-of-truth for the band assignments is `packages/contracts/data/criteria.json` (loadable via `import { ALL_CRITERIA } from "@keyboard-studio/contracts"` or the dedicated `/criteria` subpath). The Day-1 triage closed as issue #6.

---

## 12. Output artifacts

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
  HISTORY.md                  -- single entry "1.0 (<YYYY-MM-DD>)" + bullets
  README.md                   -- no version, no copyright; keyman.com + help links
  tests/
    <id>_tests.kmn            -- round-trip test vectors (from pattern test cases)
```

Compiled artifacts (`.kmx`, `.kvk`, `.js`) are produced by the in-browser compiler service and included in the `.zip` output; they are not committed to source in the PR (criteria SS1).

### Two delivery modes

**Download `.zip`.** The virtual FS is serialized to a zip archive. A `NEXT_STEPS.md` is appended explaining how to submit to `keymanapp/keyboards`; any supplied provenance metadata (Sec 8 Phase A) is rendered into `NEXT_STEPS.md` for the submitter's reference. Works without a GitHub account.

**GitHub OAuth fork+PR.** User authenticates via GitHub OAuth (`public_repo` scope). Studio forks `keymanapp/keyboards` under the user's account, creates branch `add/<id>`, commits the virtual FS source tree (no compiled artifacts), and opens a draft PR. The PR body is auto-generated:

- Green checks: listed as passing.
- Yellow items: listed by criteria.md section with the relevant field values the studio emitted.
- Red items: listed as a manual checklist for the author to complete.
- Copyright attestation: "I confirm I am the copyright holder or am authorized to submit on behalf of `<holder>`."
- Provenance metadata (when supplied): requester and language-community contact, speaker count, language status, regions, orthography link, and notes — rendered for reviewer context. Non-gating; never written into the `.kmn` source.

---

## 13. Team boundaries

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

### Content team owns

- Pattern library (mining, curation, slot parameterization, test vectors)
- Survey question text (all `prompt` strings in PatternQuestion)
- Gallery ordering and "show me more" threshold decisions
- LLM prompt templates and grounding context (Keyman reference index build); prompt templates live in `docs/prompts/` (e.g. the Phase B character-inventory linguist agent, `docs/prompts/character-inventory-linguist.md`)
- criteria.md triage: assigning final green/yellow/red classification to each checkpoint

### Day-1 joint session (blocking — parallel work cannot start until resolved)

Three contract-lock issues must be resolved in a single joint session before either team begins implementation work:

- **#5** — Lock the Pattern schema (field names, types, placeholder syntax). This spec's TypeScript interface is the proposed starting point, **including the proposed `strategyId` and `combinesWith` fields (Sec 5)** that link each pattern to the strategy catalog (Sec 7); the session ratifies or drops them.
- **#6** — Triage criteria.md into auto-fix (scaffolder/Layer C), template-bake (always-clean output), yellow-survey, and red-checklist. Final counts are inputs to the scaffolder spec and the Layer C implementation.
- **#8** — Define service interfaces in `packages/contracts` (VirtualFS shape, LintFinding type, SurveyPhaseResult, PatternMatch). Both teams build to these interfaces.

After Day 1, engine and content teams work in parallel. The Day-4 integration milestone (issue #31) is the first point where the pattern library plugs into the live survey.

---

## 14. Open questions — resolved decisions

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

**Decision 5 — CJK and Ethiopic v1 status.**
Decision: CJK and Ethiopic are confirmed excluded from v1. The Three-group routing section (Sec 9) renders a "not yet supported" stub for these scripts. The out-of-scope list (Sec 16) reflects this. These script families are candidates for sprint 2 pattern-library work.
Rationale: Reorder patterns for CJK and Ethiopic require specialist curation that is not complete. Shipping a silent empty gallery would mislead users; a stub with an explanation is the correct v1 behavior.

**Decision 6 — Desktop-first authoring scope.**
Decision: v1 supports desktop-first authoring only. The survey, strategy selector, and gallery are anchored to physical-keyboard KMN rules; the touch layout is scaffolded from the desktop OSK in Phase E (no reverse touch-to-desktop derivation in v1). Authors whose primary deployment is mobile are surfaced this posture at Phase A before they invest survey time and may continue with the desktop-first flow (still receiving a derived touch layout). Touch-first authoring is a v1.1 candidate.
Rationale: The strategy framework (Sec 7) and the seven discovery axes (Sec 7.1) elicit physical-keyboard mental-model answers — key names like `K_QUOTE`, modifier-plane availability, base-layout collisions. Inverting the data flow to touch-first requires touch-first strategy variants that are not yet curated and would expand v1 scope materially. Mobile-first authoring is a known v1.1 work-item, not a silent gap.

---

## 15. Acceptance scenarios

### Scenario A: Latin QWERTY keyboard with a deadkey

**Starting state:** Studio open, no authentication, US-English fallback base selected.
**User actions:** Phase A — enters language name "Tuvan", tag `tyv`, copyright holder "Researcher Name". Phase B — adds characters `a e i o u` with acute accent variants. Phase C — selects the "tap then base letter" deadkey pattern; picks `K_QUOTE` as trigger key; lists base `aeiou` and accented `áéíóú`. Phase C' — NFD reorder auto-emitted. Phases D-G complete with defaults. Clicks "Download .zip".
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

---

## 16. Out of scope

- **Triage tool for traditional submissions** — a separate project that reuses `@keymanapp/kmn-validator` and `@keymanapp/keyboard-lint`; not part of keyboard-studio.
- **LDML output** — deferred until the LDML-to-touch build path lands in the Keyman toolchain. Emission format is locked to KMN + `.keyman-touch-layout`.
- **Mobile-app integration** — `oem/` updates, partner CSV updates, partner-organization bundle workflows.
- **Touch-first authoring path** — v1 supports desktop-first authoring only (Decision 6, Sec 14). The survey, strategy selector, and gallery are anchored to physical-keyboard mental-model answers; the touch layout is scaffolded from the desktop OSK in Phase E with no reverse derivation. Mobile-primary authors are surfaced this at Phase A and may continue with the desktop-first flow (still receiving a derived touch layout). Touch-first authoring is a v1.1 candidate.
- **Hosting and deployment** — infrastructure is left to the operator; this project ships a static SPA.
- **CJK and Ethiopic reorder patterns in v1** — confirmed excluded; see Sec 14, decision 5. Target: sprint 2 pattern-library work.
- **Multi-language `welcome.htm` variants** — LLM-generated variants for multiple languages; post-v1.
- **Editing existing keyboards** — the studio creates new keyboards from a base; it does not support round-tripping or editing an uploaded `.kmn`.
- **`.kpj.user` or build-folder management beyond what the scaffolder strips** — cleanup is one-time at scaffold time.
- **Predictive text / wordlists (`.model.ts`)** — the strategy catalog (Sec 7) covers input rules only; lexical models are a separate artifact, post-v1. (A pasted text sample *is* used in Phase B for **character discovery** — enumerating which characters the keyboard must support — which is in scope, Sec 8. Only the wordlist / frequency *model* is deferred.)
- **Migration of legacy binary keyboards** — the studio authors from KMN sources; it does not import compiled `.kmx`/`.kmn` binaries.

Note: touch/mobile layouts and `.kmp`/`.kvks`/`.keyboard_info` generation are **in** scope (Phases E, D, G) — the strategy framework (Sec 7) was originally drafted physical-keyboard-only, but in the studio it is the desktop-rule layer of the full pipeline (see Sec 7 scope note).

---

## 17. Glossary

**BCP47.** Internet standard tag format for identifying human languages and scripts. Example: `tyv` (Tuvan), `hi-Deva` (Hindi in Devanagari script). Used throughout for language and script identification.

**CasedKeys (`&CasedKeys`).** A Keyman system store declaring the set of virtual keys that participate in `CAPS`/`NCAPS` modifier logic. Scaffold inserts the appropriate set per script group; non-Roman scripts default to omitting it.

**deadkey.** A KMN mechanism in which pressing a key emits no character immediately but sets a named state that modifies the next keystroke. Written as `deadkey(name)` in KMN context positions; `dk()` is a synonym.

**decision tree.** The ordered rule set (Sec 7.2) that maps a keyboard's discovery-axis values to a primary output strategy (S-01..S-12) plus secondaries. The strategy selector runs it; its output drives which gallery patterns are shown.

**discovery axis.** One of the seven dimensions (A1–A7, Sec 7.1) the survey computes to describe a keyboard's input-method needs (scale, script class, phonetic intuition, diacritic behavior, multi-mode, constraint enforcement, spare-key availability). The axis vector is the decision tree's input.

**identity propagation.** The scaffolder step that resets the base keyboard's identifier fields — keyboard name, BCP47 language tag, copyright line, and version — to values for the new keyboard being authored. Prevents base-keyboard metadata from appearing in the submitted keyboard.

**kmnFragment.** The KMN rule text embedded in a Pattern record, containing `{{slotId}}` placeholders that the scaffolder replaces with user-supplied values.

**Layer A / Layer B / Layer C.** The three validation layers in the lint engine. Layer A: structural and semantic validity (14 compiler checks). Layer B: style and canonical form (TS AST rules). Layer C: repo hygiene against criteria.md checkpoints. See Sec 10 for details.

**NCAPS.** A Keyman modifier keyword that suppresses `CAPS LOCK` behavior on a rule. A known scaffolding hygiene issue is leftover `NCAPS` modifiers in base keyboards that should be stripped.

**OAuth.** Open Authorization. The protocol used for GitHub authentication in the studio's fork+PR delivery path. The studio requests `public_repo` scope only.

**slot.** A named placeholder in a `kmnFragment` (written `{{slotId}}`). Each slot corresponds to a `PatternQuestion` whose answer is substituted at scaffolding time.

**store.** A KMN named sequence of characters or virtual keys, declared with `store(name) '...'`. Stores are referenced in rules via `any(name)` and `index(name, N)`.

**strategy card / strategy ID.** A strategy card (Sec 7.3) is a self-contained, citable description of one `.kmn` output method, identified by a strategy ID (`S-01`..`S-12`). A `Pattern` (Sec 5) names the card it implements via its `strategyId` field.

**virtual FS.** The in-memory filesystem the scaffolder builds during authoring. Mirrors the directory structure expected by `keymanapp/keyboards`. Serialized to `.zip` for download or committed directly for the OAuth PR path.

**WASM.** WebAssembly. The binary format used to run `kmcmplib` (the Keyman compiler) in-browser. Enables 100-300 ms warm recompile without a server round-trip.

---

## 18. Revision policy

This spec evolves via explicit revision requests tracked in the keyboard-studio issue tracker. Changes to prose sections (data flow, scenarios, out-of-scope list) may be made by the spec maintainer following a single-reviewer approval. Changes to the Pattern schema (Sec 5) require a joint engine+content session (the same threshold as the Day-1 contract lock); breaking field changes — renames, type changes, removals — require a major version bump of the `Pattern` interface and a corresponding update to `packages/contracts`. Changes to resolved decisions in Sec 14 require an explicit revision request citing the original decision and the new evidence; they may not be re-opened informally. The following items are tracked for a v1.1 revision cycle and are not in scope for v1: risk and dependencies section, performance targets table, and accessibility section.

---

## 19. Reference

| Document | Location |
|---|---|
| Authoring plan and component architecture | `docs/KM-Questionnaire.md` in the keyboard-studio repo, or https://github.com/MattGyverLee/keyboard-studio/blob/main/docs/KM-Questionnaire.md |
| Validator / lint architecture (14 compiler checks) | `docs/lint.md` in the keyboard-studio repo, or https://github.com/MattGyverLee/keyboard-studio/blob/main/docs/lint.md |
| PR review criteria (~200 checkpoints, green/yellow/red) | `docs/criteria.md` in the keyboard-studio repo, or https://github.com/MattGyverLee/keyboard-studio/blob/main/docs/criteria.md |
| Template-cleanup recipe (scaffolder source of truth) | `docs/making-a-template.md` in the keyboard-studio repo, or https://github.com/MattGyverLee/keyboard-studio/blob/main/docs/making-a-template.md |
| `.kmn` strategy framework (discovery axes, decision tree, strategy cards S-01..S-12) | Merged into Sec 7 of this spec. `strategy tree/strategies.md` is retained only as a stub pointer — do not treat it as a separate source. |
| GitHub repository | https://github.com/MattGyverLee/keyboard-studio |
| Issue tracker | https://github.com/MattGyverLee/keyboard-studio/issues |

Issues #5, #6, #8, and #31 are the critical-path items. Do not reference individual issues in shipped code comments; cross-link via commit messages and PR bodies.

This spec is maintained under the revision policy in Sec 18. The next scheduled review is at the Day-4 integration milestone (issue #31).

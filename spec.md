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
7. [Data flow](#7-data-flow)
8. [Three-group routing](#8-three-group-routing)
9. [Validator and lint engine](#9-validator-and-lint-engine)
10. [criteria.md compliance](#10-criteriamd-compliance)
11. [Output artifacts](#11-output-artifacts)
12. [Team boundaries](#12-team-boundaries)
13. [Open questions — resolved decisions](#13-open-questions--resolved-decisions)
14. [Acceptance scenarios](#14-acceptance-scenarios)
15. [Out of scope](#15-out-of-scope)
16. [Glossary](#16-glossary)
17. [Revision policy](#17-revision-policy)
18. [Reference](#18-reference)

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
|   +-- survey                            Six-phase branching questionnaire; LLM maps answers to
|   |                                     slot values; plain-language throughout.
|   +-- gallery                           Show-by-example mini-keyboards; user taps and picks;
|                                         each entry is a validated KMN skeleton with named slots.
|
+-- pattern-library loader     [content]  Parameterized, human-reviewed KMN skeletons for desktop,
|                                         touch, and reorder interactions; mined from release/,
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

This schema is the Day-1 contract. Any change to field names or types requires a joint session (issue #5). Breaking changes to the `Pattern` interface require a major version bump (see Sec 17).

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

## 7. Data flow

1. **Base selection.** User opens studio; base-keyboard browser fetches `keymanapp/keyboards` index via GitHub API, highlights `release/basic/` as the default pool. User picks a base (or accepts US-English fallback).

2. **Scaffolding.** Project scaffolder duplicates the chosen base into an in-memory virtual FS, applies the full template-cleanup pipeline (identity reset, NCAPS strip, `[CAPS]` deletion, `&CasedKeys` insertion, touch-layout cleanup), and runs Layer C hygiene. The scaffolded project is clean-by-construction before the user touches anything.

3. **Survey — Phase A (Identity + routing).** User enters language name, BCP47 tag (with langtags.json lookup), display name, copyright holder. System detects script group (QWERTY/QWERTZ, AZERTY, or non-Roman) from BCP47 + base choice and confirms with the user. This routes all subsequent phases.

4. **Survey — Phase B (Character coverage).** User pastes or lists target characters. Studio diffs against base keyboard output set; for each new character, user states which key it lives on and under what modifier. Emits simple substitution rules.

5. **Gallery — Phase C (Special inputs).** User sees live mini-keyboards demonstrating interaction patterns (deadkeys, longpress menus, rotas, modifier layers, etc.). Standard patterns for the script group appear first; less common ones are behind "show me more." User taps each demo, picks those that match their language, fills plain-language slot questions. Each selected pattern is inserted as a validated KMN skeleton.

6. **Gallery/auto — Phase C' (Reordering).** (C-prime.) QWERTY/QWERTZ and AZERTY groups get NFD normalization auto-emitted unless the base already has a reorder scheme. Non-Roman groups see a curated reorder gallery (pre-base vowel, halant/conjunct, tone-mark, subscript stacking) and pick the pattern matching their script family.

7. **Auto + survey — Phase D (OSK desktop).** OSK `.kvks` is auto-populated from rule output; modifier-name consistency enforced across `.kmn`/`.kvks`/`.keyman-touch-layout`; `usealtgr` tag auto-inserted when `RALT` is present. Survey intervenes only when modifier-naming intent is ambiguous.

8. **Gallery — Phase E (Touch layout).** Touch layout JSON scaffolded from desktop KVK via modifier-to-layer mapping. User sees touch-feature galleries (longpress menus, layer switching, flicks, multitap) as live tappable demos and enables those that fit their language. Output validated against the touch-layout JSON schema.

9. **Survey — Phase F (Help docs).** `welcome.htm` generated from template (BCP47 lang attr from Phase A, no version, no copyright). User writes descriptive content; `help/<name>.php` regenerated deterministically from the same content, guaranteeing body+style parity.

10. **Auto — Phase G (Package).** `.kps` pre-populated: `LICENSE.md` as license file (avoids `KM0900A`), "Follow keyboard version" set, language tags from Phase A, Files block matches `targets`.

11. **Live preview.** Every edit triggers a 300 ms debounce; kmcmplib compiles to blob URLs; KeymanWeb reloads with the new keyboard; lint chips appear for any diagnostics. Submit button is blocked until zero warnings.

12. **Lint and validate.** Layer A (validity) + Layer B (style) run on every edit; Layer C (hygiene) runs on each phase exit and at submit. Green checks pass silently; yellow checks surface as survey questions at the relevant phase; red checks appear as a final checklist before PR submission.

13. **Output.** User chooses download `.zip` (virtual FS serialized, readme on next steps, no auth required) or GitHub OAuth fork+draft PR (fork `keymanapp/keyboards`, branch `add/<id>`, commit virtual FS, open draft PR with auto-generated body listing green checks passed, yellow items by criteria section, red items as a final checklist, plus copyright attestation).

---

## 8. Three-group routing

The survey branches at Phase A based on BCP47 tag, base-keyboard choice, and user confirmation. The three groups share the same phase structure but differ in authoring emphasis, reordering load, and `&CasedKeys` content.

| Group | Typical bases | Primary challenges | CasedKeys default | Reorder posture |
|---|---|---|---|---|
| QWERTY / QWERTZ | `release/basic/*`, English/German-family | Character substitution, diacritics via deadkeys, occasional RALT/AltGr | `[K_A]..[K_Z]` | NFD normalization; auto-emitted unless base has its own scheme |
| AZERTY | French/Francophone-Africa bases | Position remapping (Q<->A, W<->Z), shifted digits, heavy AltGr layer | `[K_A]..[K_Z] [K_0]..[K_9] [K_HYPHEN] [K_EQUAL] [K_LBRKT] [K_RBRKT] [K_BKSLASH] [K_QUOTE] [K_COMMA] [K_PERIOD] [K_SLASH] [K_COLON]` | NFD normalization; auto-emitted unless base has its own scheme |
| Non-Roman | Curated bases per script family (Indic, Arabic, Hebrew, SEA, etc.) | Character mapping, heavy reordering, script-specific OSK conventions | Typically omitted; survey confirms per script (see decision in Sec 13) | Gallery-picked: pre-base vowel, halant/conjunct, tone-mark, subscript stacking |

**Routing decision.** Group is detected automatically from the BCP47 script subtag and the chosen base keyboard, then confirmed with the user in a single plain-language step before the survey continues. Non-Roman group is further sub-routed to a script-family branch (Indic, Arabic, SEA, etc.) that controls which reorder patterns are shown in Phase C'.

**Reorder priority order.** (1) Adopt the base keyboard's existing reorder scheme if present. (2) Otherwise, for QWERTY/QWERTZ and AZERTY, auto-emit a standard NFD-normalization `group(reorder)`. (3) For non-Roman, present the curated reorder pattern gallery; user picks the pattern matching their script's behavior. The LLM maps user intent to slot values; it does not author group chains from scratch.

**CJK and Ethiopic — v1 exclusion.** CJK and Ethiopic script families are acknowledged members of the Non-Roman group but are excluded from v1. Their reorder patterns require specialist curation not yet complete. The gallery renders a "not yet supported" stub for these scripts rather than an empty gallery, so users receive a clear explanation rather than a silent gap.

---

## 9. Validator and lint engine

The validator is the sole arbiter of what the survey and LLM are allowed to emit. Existing keyboards in `release/` are not treated as authoritative — the corpus contains both clean and defective patterns, and bad patterns must not survive by inertia.

### Three-layer architecture

| Layer | Name | Runs | Packages |
|---|---|---|---|
| A | Validity (structural + semantic) | Per-keystroke (TS checks) + per-compile (WASM oracle) | `@keymanapp/kmn-validator` |
| B | Style / canonical form | Per-compile (TS AST rules) | `@keymanapp/kmn-validator` |
| C | Repo hygiene (criteria.md) | Per-phase-exit + at submit | `@keymanapp/keyboard-lint` |

**Lint and compile cycle.** One debounce cycle (300 ms) runs two concurrent microtasks: the TS-check pass and the WASM oracle. A TS-check error suppresses the WASM call; a WASM diagnostic always supersedes a conflicting TS diagnostic. This is the resolved single-cycle design (see Sec 13, decision 3).

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

## 10. criteria.md compliance

The ~200 criteria in `criteria.md` are classified into four enforcement bands (see Sec 13, decision 4 for the authoritative band definition):

**Green — by construction.** The scaffolder and validator enforce these automatically. The user never sees them as explicit questions because they cannot be violated through the studio's UI.

**Yellow — via survey.** These require reading and understanding content, consulting a public resource (langtags, Ethnologue, an organization's website), or making a judgment call. The survey surfaces them as plain-language questions at the relevant phase.

**Red — at submit.** These require out-of-band information that no public source records (e.g. original-author permission for a third-party patch). They appear as a final checklist before PR submission; the user must check them off manually. The PR body flags them for the reviewer.

| Band | Count (approx.) | Example criterion | Enforcement |
|---|---|---|---|
| Green | ~115 | "No leading zeros in version components" (SS2) — regex-checkable, auto-fixable | Scaffolder resets version to `1.0`; Layer C blocks any version with leading zeros |
| Yellow | ~60 | "BCP47 tag is correct for the language/script" (SS12) — requires langtags.json lookup and linguistic judgment | Phase A survey asks for the tag; studio cross-checks against langtags.json and flags mismatches for user review |
| Red | ~15 | "If a third party submits a patch to an existing keyboard, original author was consulted" (SS14) — requires direct author communication | Final checklist item in PR submission flow; PR body includes a reminder block |

The exact green/yellow count split is a Day-1 sync item (issue #6). Counts above are estimates; the final triage (Sec 12) produces authoritative numbers.

---

## 11. Output artifacts

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

**Download `.zip`.** The virtual FS is serialized to a zip archive. A `NEXT_STEPS.md` is appended explaining how to submit to `keymanapp/keyboards`. Works without a GitHub account.

**GitHub OAuth fork+PR.** User authenticates via GitHub OAuth (`public_repo` scope). Studio forks `keymanapp/keyboards` under the user's account, creates branch `add/<id>`, commits the virtual FS source tree (no compiled artifacts), and opens a draft PR. The PR body is auto-generated:

- Green checks: listed as passing.
- Yellow items: listed by criteria.md section with the relevant field values the studio emitted.
- Red items: listed as a manual checklist for the author to complete.
- Copyright attestation: "I confirm I am the copyright holder or am authorized to submit on behalf of `<holder>`."

---

## 12. Team boundaries

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
- LLM prompt templates and grounding context (Keyman reference index build)
- criteria.md triage: assigning final green/yellow/red classification to each checkpoint

### Day-1 joint session (blocking — parallel work cannot start until resolved)

Three contract-lock issues must be resolved in a single joint session before either team begins implementation work:

- **#5** — Lock the Pattern schema (field names, types, placeholder syntax). This spec's TypeScript interface is the proposed starting point.
- **#6** — Triage criteria.md into auto-fix (scaffolder/Layer C), template-bake (always-clean output), yellow-survey, and red-checklist. Final counts are inputs to the scaffolder spec and the Layer C implementation.
- **#8** — Define service interfaces in `packages/contracts` (VirtualFS shape, LintFinding type, SurveyPhaseResult, PatternMatch). Both teams build to these interfaces.

After Day 1, engine and content teams work in parallel. The Day-4 integration milestone (issue #31) is the first point where the pattern library plugs into the live survey.

---

## 13. Open questions — resolved decisions

The following items were open at the time of the initial draft. Each is now a binding decision for v1. Revisiting any decision requires an explicit revision request following the process in Sec 17.

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
Decision: CJK and Ethiopic are confirmed excluded from v1. The Three-group routing section (Sec 8) renders a "not yet supported" stub for these scripts. The out-of-scope list (Sec 15) reflects this. These script families are candidates for sprint 2 pattern-library work.
Rationale: Reorder patterns for CJK and Ethiopic require specialist curation that is not complete. Shipping a silent empty gallery would mislead users; a stub with an explanation is the correct v1 behavior.

---

## 14. Acceptance scenarios

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

## 15. Out of scope

- **Triage tool for traditional submissions** — a separate project that reuses `@keymanapp/kmn-validator` and `@keymanapp/keyboard-lint`; not part of keyboard-studio.
- **LDML output** — deferred until the LDML-to-touch build path lands in the Keyman toolchain. Emission format is locked to KMN + `.keyman-touch-layout`.
- **Mobile-app integration** — `oem/` updates, partner CSV updates, partner-organization bundle workflows.
- **Hosting and deployment** — infrastructure is left to the operator; this project ships a static SPA.
- **CJK and Ethiopic reorder patterns in v1** — confirmed excluded; see Sec 13, decision 5. Target: sprint 2 pattern-library work.
- **Multi-language `welcome.htm` variants** — LLM-generated variants for multiple languages; post-v1.
- **Editing existing keyboards** — the studio creates new keyboards from a base; it does not support round-tripping or editing an uploaded `.kmn`.
- **`.kpj.user` or build-folder management beyond what the scaffolder strips** — cleanup is one-time at scaffold time.

---

## 16. Glossary

**BCP47.** Internet standard tag format for identifying human languages and scripts. Example: `tyv` (Tuvan), `hi-Deva` (Hindi in Devanagari script). Used throughout for language and script identification.

**CasedKeys (`&CasedKeys`).** A Keyman system store declaring the set of virtual keys that participate in `CAPS`/`NCAPS` modifier logic. Scaffold inserts the appropriate set per script group; non-Roman scripts default to omitting it.

**deadkey.** A KMN mechanism in which pressing a key emits no character immediately but sets a named state that modifies the next keystroke. Written as `deadkey(name)` in KMN context positions; `dk()` is a synonym.

**identity propagation.** The scaffolder step that resets the base keyboard's identifier fields — keyboard name, BCP47 language tag, copyright line, and version — to values for the new keyboard being authored. Prevents base-keyboard metadata from appearing in the submitted keyboard.

**kmnFragment.** The KMN rule text embedded in a Pattern record, containing `{{slotId}}` placeholders that the scaffolder replaces with user-supplied values.

**Layer A / Layer B / Layer C.** The three validation layers in the lint engine. Layer A: structural and semantic validity (14 compiler checks). Layer B: style and canonical form (TS AST rules). Layer C: repo hygiene against criteria.md checkpoints. See Sec 9 for details.

**NCAPS.** A Keyman modifier keyword that suppresses `CAPS LOCK` behavior on a rule. A known scaffolding hygiene issue is leftover `NCAPS` modifiers in base keyboards that should be stripped.

**OAuth.** Open Authorization. The protocol used for GitHub authentication in the studio's fork+PR delivery path. The studio requests `public_repo` scope only.

**slot.** A named placeholder in a `kmnFragment` (written `{{slotId}}`). Each slot corresponds to a `PatternQuestion` whose answer is substituted at scaffolding time.

**store.** A KMN named sequence of characters or virtual keys, declared with `store(name) '...'`. Stores are referenced in rules via `any(name)` and `index(name, N)`.

**virtual FS.** The in-memory filesystem the scaffolder builds during authoring. Mirrors the directory structure expected by `keymanapp/keyboards`. Serialized to `.zip` for download or committed directly for the OAuth PR path.

**WASM.** WebAssembly. The binary format used to run `kmcmplib` (the Keyman compiler) in-browser. Enables 100-300 ms warm recompile without a server round-trip.

---

## 17. Revision policy

This spec evolves via explicit revision requests tracked in the keyboard-studio issue tracker. Changes to prose sections (data flow, scenarios, out-of-scope list) may be made by the spec maintainer following a single-reviewer approval. Changes to the Pattern schema (Sec 5) require a joint engine+content session (the same threshold as the Day-1 contract lock); breaking field changes — renames, type changes, removals — require a major version bump of the `Pattern` interface and a corresponding update to `packages/contracts`. Changes to resolved decisions in Sec 13 require an explicit revision request citing the original decision and the new evidence; they may not be re-opened informally. The following items are tracked for a v1.1 revision cycle and are not in scope for v1: risk and dependencies section, performance targets table, and accessibility section.

---

## 18. Reference

| Document | Location |
|---|---|
| Authoring plan and component architecture | `docs/KM-Questionnaire.md` in the keyboard-studio repo, or https://github.com/MattGyverLee/keyboard-studio/blob/main/docs/KM-Questionnaire.md |
| Validator / lint architecture (14 compiler checks) | `docs/lint.md` in the keyboard-studio repo, or https://github.com/MattGyverLee/keyboard-studio/blob/main/docs/lint.md |
| PR review criteria (~200 checkpoints, green/yellow/red) | `docs/criteria.md` in the keyboard-studio repo, or https://github.com/MattGyverLee/keyboard-studio/blob/main/docs/criteria.md |
| Template-cleanup recipe (scaffolder source of truth) | `docs/making-a-template.md` in the keyboard-studio repo, or https://github.com/MattGyverLee/keyboard-studio/blob/main/docs/making-a-template.md |
| GitHub repository | https://github.com/MattGyverLee/keyboard-studio |
| Issue tracker | https://github.com/MattGyverLee/keyboard-studio/issues |

Issues #5, #6, #8, and #31 are the critical-path items. Do not reference individual issues in shipped code comments; cross-link via commit messages and PR bodies.

This spec is maintained under the revision policy in Sec 17. The next scheduled review is at the Day-4 integration milestone (issue #31).

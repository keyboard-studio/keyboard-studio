# keyboard-studio — Spec

**Repository:** https://github.com/keyboard-studio/keyboard-studio
**Date:** 2026-06-15
**Version:** 1.3.1
**Status:** Draft — pre-Day-1 sync

---

## Table of Contents

1. [Elevator pitch](#1-elevator-pitch)
2. [Why this exists](#2-why-this-exists)
3. [Target user](#3-target-user)
3a. [What the user brings (skill envelope)](#3a-what-the-user-brings-skill-envelope)
3b. [What success looks like (outcome envelope)](#3b-what-success-looks-like-outcome-envelope)
3c. [Defaults are the product](#3c-defaults-are-the-product)
4. [System overview](#4-system-overview)
5. [Pattern schema](#5-pattern-schema)
5a. [KeyboardIR (keyboard intermediate representation)](#5a-keyboardir-keyboard-intermediate-representation)
6. [Worked example](#6-worked-example)
7. [Strategy selection](#7-strategy-selection) → extracted to [`specs/007-strategy-selection/spec.md`](specs/007-strategy-selection/spec.md)
8. [Data flow](#8-data-flow) → extracted to [`specs/008-data-flow/spec.md`](specs/008-data-flow/spec.md)
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

## 3a. What the user brings (skill envelope)

*Added 2026-06-15. Companion to §3.*

This subsection makes explicit what the studio assumes the user *can* and *cannot* do, so downstream decisions can resolve back to it.

**The studio assumes the user can:**

- Recognize their language's characters by sight; correct an inventory when shown one.
- Answer **comparative questions** ("does this sound like that?", "does the mark come before or after?") by example, even when they could not answer the equivalent abstract question ("how many tones does your language have?", "what is mark-input order?"). This is the **research-by-pairs** pattern: many small comparisons converge on a map the user could not have stated directly. The survey is built around this.
- Recognize behaviour from a live preview and decide if it matches their intent, without needing to name the mechanism.
- Defer answers. "Not yet" is a valid answer; the studio remembers gaps and resumes.

**The studio assumes the user cannot:**

- Read or write `.kmn`, `.kvks`, or any other Keyman source format (already in §3).
- Navigate GitHub workflows — branches, PRs, conflicts, review threads. **The studio manages the tech side; the user manages only linguistics.** A GitHub login is acceptable; a GitHub workflow is not.
- Read English-language Keyman documentation. Concepts are learned by show-and-tell.
- Maintain the keyboard over years (see §3b).
- Adjudicate multilingual-tradeoff design (anchors §7's monolingual scope).

**User-variation envelope.** The user spread runs **community activist → field linguist → PhD researcher**. All are "language experts" in the §3 sense; their patience for design tradeoffs, English-language UI, and pattern abstraction varies. **The studio targets the broadest of these** — operable by a community activist with no software background — and higher-skill users complete the same flow faster, not differently.

**Collaborator.** The user's primary partner is the **linguist agent** (LLM that proposes, cross-checks, and confirms — §7.6, §8 Phase B, §7.7). The user is solo with the agent, not solo with a form. Remote human collaboration (a Keyman reviewer, a fellow linguist) is not in the studio's surface; reviewers see the PR, they do not see the session.

**User behaviour patterns the studio designs for.**

- **Naive users accept reasonable defaults and do not question them.** A default that gets the user 80% of the way will be shipped as-is; the remaining 20% will not be challenged. This is the **opposite** of Keyman Developer's blank-canvas posture, where the user originates every decision. **The studio's value sits in the defaults, not in the override controls** — the corpus-prior placements (§7.6), the strategy-selector primary (§7.2), the script-class axis fills (§7.2 input contract), the DISCUS-arbitrated mechanism rankings (§7.7), the base-derived prefill (§5), and the carve-gallery starting state are all instances of this principle. A weak default is a user-visible failure regardless of whether override controls exist.
- **Power users want full control.** Every default must be visibly overridable. Naive-user defaults and power-user controls are not in tension — they share the same surface; the naive user accepts, the power user changes. A studio that forces choice on naive users to please power users has failed the broader cohort §3 targets.

---

## 3b. What success looks like (outcome envelope)

*Added 2026-06-15. Companion to §3.*

Success for the studio is **a working keyboard committed to `keymanapp/keyboards` by a user who could not have produced one without the studio.** Any narrower measure misses authors we serve; any broader measure (community adoption, downstream impact) is mostly outside the studio's influence and inside Keyman's promotion surface.

**Success is:**

- A user who has never seen `.kmn` ships a keyboard whose `kmc build` exit code is 0, whose Layer C lint is green, and whose PR lands in the user's chosen delivery path (`.zip` download or OAuth fork+PR).
- That keyboard reflects the user's **linguistic intent** — not just any valid keyboard, but the one the user meant to build. The live preview and linguist-agent cross-checks (§7.6, §8 Phase B) are the user-side guarantee of this.

**Success is not:**

- *Not* "the community adopts the keyboard." Adoption depends on promotion, OS support, font availability, and Keyman's distribution channels — all downstream of submission and outside the studio's influence. Promotion is Keyman's surface; the studio surfaces the submission.
- *Not* "the user understands what they shipped well enough to maintain it over years." Maintenance is rare for monolingual keyboards (most are one-time submissions); MML keyboards are out of scope for new authoring (§7). When maintenance is needed, the same studio session re-opens the same working copy and re-enters the same flow.
- *Not* "constructive user feedback returns to the studio." Real-world feedback is mostly the unhelpful "keyboard doesn't work" form. The studio optimises for *successful submission*, not iterative improvement driven by users.

**Submission posture.** A **monolingual keyboard is typically a one-time submission** — the studio is sized for this: ship-it-and-leave with the option to re-open, not a multi-year project IDE. A **massively multilingual keyboard is a multi-year affair**, out of scope for new authoring; supported only as a Track 1 base (§7).

**Licensing posture.** All submissions are MIT-licensed; the studio surfaces this in the documentation phase. Content-change rights remain with the original author or their successor by Keyman policy; others fork and submit their own. The studio makes a Keyman-repo-level fork easy; within-studio forks are not a separate concept.

---

## 3c. Defaults are the product

*Added 2026-06-15. Companion to §3a (skill envelope) — the design principle that follows from the "naive users accept reasonable defaults" pattern.*

The target user (§3, §3a) is, by design, **not** equipped to second-guess the studio. This has a direct consequence for every decision point in the flow:

> Naive users accept reasonable defaults and do not question them. The studio's value sits in the defaults, not the override controls. A weak default is a user-visible failure regardless of whether override controls exist.

This is the same failure mode §2 describes from the reviewer's side — the hygiene mistakes reviewers silently fix across dozens of PRs are, almost always, a default the upstream tool never proposed. Keyman Developer's blank canvas pushes the decision onto an author who lacks the context to make it; the studio's job is to make that decision *for* them and let them confirm it.

**The posture is propose-then-confirm, everywhere.** This generalizes the §5 base-derived pre-fill rule — *never ask before you can pre-fill* — from base-derived answers to **every** answer the studio has data to propose. Wherever the studio holds a signal that bears on a decision — the chosen base, the BCP47 tag, CLDR, a placement corpus, the OAuth identity, already-collected survey answers, the discovery axes — that signal is converted into a **proposed default rendered as an editable confirmation**, never a blank field. A decision point left blank when a default was derivable is a defect, not a neutral hand-off.

**Three zero-flag model patterns** (the §7 strategy framework already follows all three; the rest of the flow converges on them):

- **Input-contract default-fill (§7.1–§7.2).** Missing axes are filled from a defensible structural prior (script class, routing group) rather than re-asked — the §7.1 axis vector is derived from the best available source before the §7.2 decision tree consumes it, never left blank. (Making the origin of each fill auditable via a named `axisFills` provenance record on the survey result is a planned hardening, not yet in the contract.)
- **Corpus-derived priors (§7.6).** Where peers exist, the studio proposes **ranked candidates with provenance** ("N existing keyboards for similar languages chose this"), never a blank field. The studio researches a default by its **peers** — the language's BCP47 pair, its script family, comparable communities — and surfaces the ranked result. This is *research-by-pairs*: a default is something the studio looked up among comparable keyboards, not something it invented.
- **Base-derived pre-fill (§5).** When the base or already-collected metadata fixes an answer, it is pre-filled as a confirmation the author edits in place.

**Provenance is mandatory, silence is not.** Every proposed default carries a visible provenance label (corpus citation, CLDR, base, OAuth identity, derived-from-axis) and is overridable in place — the author is always the authority. The studio **never resolves a decision silently** and never presents a blank field where it could have proposed. Where a default is genuinely *not* derivable, that is recorded as a deliberate no-default decision adjacent to the question (with a prompt-*with-hint* as the floor — a hinted prompt, never an empty box), not left to silence. A **confidently wrong default is as much a failure as a blank one** — precisely because the naive user accepts it unquestioned; where the signal is weak or the field is attribution-sensitive (e.g. who holds copyright), the studio proposes a **structured choice** or a **hint** rather than asserting a single value it cannot stand behind. Identity, paperwork, and help-documentation phases are held to this same bar as the technical phases — there is no "it's just metadata" exemption.

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

> **Moved.** As of 2026-06-16, §5 is extracted into [`specs/005-pattern-schema/spec.md`](specs/005-pattern-schema/spec.md) as the third section of the spec-kit migration (after §7, §8). That file is authoritative for §5; this stub exists only so cross-references to "Sec 5" / "§5" continue to resolve.
>
> The `Pattern` / `PatternQuestion` / `TestVector` / `PatternCategory` / `AnswerType` types, the `{{slotId}}` placeholder convention, `appliesTo` semantics, and the `strategyId` / `combinesWith` / `origin` / `ownedNodes` linkage fields all live in the extracted file. The canonical type is `packages/contracts/src/pattern.ts` (runtime-enforced by the zod schemas in `packages/contracts/src/schemas.ts`); update it there, not here. Field renames/type changes/removals remain a locked-contract change (major `@keyboard-studio/contracts` bump + joint engine+content session, §18).

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

> **Audience.** Primary: pattern curator (content team). Secondary: engine implementer.
> A curator walks away knowing what fields a Pattern record carries and how survey questions feed `{{slotId}}` placeholders. The embedded `kmnFragment` literal is curator-authored but assumes KMN literacy — slot resolution into a compileable rule is implementer-side. Pair with an implementer when authoring fragments.

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

**Base-derived pre-fill.** A `PatternQuestion` (and a survey question, Sec 8) may declare a `default`. When the chosen base keyboard already determines the answer, the studio pre-fills that default from the base rather than asking blank: the BCP47 script subtag and the IR's structural shape fix the routing group (Sec 9) and script class (A2); the base-vs-inventory key diff fixes spare-key availability (A7); the base's BCP47 tag seeds the language code and region. Pre-filled answers render as **confirmations** (editable, already populated), never as empty fields — the principle is *never ask before you can pre-fill*. This is the same propose-then-confirm posture as the placement proposals (Sec 8 Phase B) and the linguist agent; the author confirms or overrides each pre-fill in place.

**Optionality vs. §3c (the §7.1 axis-fill model).** The `default` field is *structurally* optional, but — exactly as with the discovery axes (§7.1) — that optionality marks a **static slot vs. a runtime fill**, not permission to ask blank. An axis is rarely a literal authored constant; it is derived from the best available source rather than asked blank (recording the origin of each fill via a named `axisFills` provenance record on the survey result is a planned hardening, not yet in the contract). A `PatternQuestion` default behaves the same way: the `default` field holds only the statically-known case, while the *live* default is derived per session — from the base (above), a corpus prior (§7.6), an axis fill (§7.1), or collected metadata (CLDR, OAuth identity, prior answers) — and rendered as a provenance-labeled confirmation. (The substitution engine does not read `default` as a fallback; it is the survey pre-fill / display hint, while the confirmed value flows through the assignment map's slot values — so this is a UI-default contract, not a change to slot substitution.) Per §3c, a question whose answer the studio *could* propose (statically or via any derivation source) yet renders blank is a **defect**, ranked with the §2 reviewer-hygiene fixes and surfaced at phase exit like a §11 yellow check — not a neutral omission. A question is legitimately left unprimed only when no source can supply a default, and that is recorded as a deliberate no-default decision (a hinted prompt as the floor, §3c), never left to silence. Hardening this into the type system — a required `default`, or a `defaultSource` discriminator that records a default's origin the way the planned `axisFills` will for an axis fill — is a `Pattern`-schema change: as an additive optional field it is strictly a minor bump under §18, but Pattern-schema additions are routed through the #5/#5b joint session by convention. Until then the field stays optional and the rule is enforced by review.

---

## 7. Strategy selection

> **Moved.** As of 2026-06-15, §7 is extracted into [`specs/007-strategy-selection/spec.md`](specs/007-strategy-selection/spec.md) as the pilot of the section-by-section spec-kit migration. That file is authoritative for §7; this stub exists only so cross-references to "Sec 7" / "§7" continue to resolve.
>
> Decision-tree axes, the S-01..S-13 strategy catalog, the §7.5 self-check table, and the §7.7 gallery assignment-map precedence all live in the extracted file. Update them there, not here.

## 8. Data flow

> **Moved.** As of 2026-06-15, §8 is extracted into [`specs/008-data-flow/spec.md`](specs/008-data-flow/spec.md) as the second section of the spec-kit migration. That file is authoritative for §8; this stub exists only so cross-references to "Sec 8" / "§8" continue to resolve.
>
> The two-track working-copy spine, the 15-step pipeline, the hybrid workflow ordering, the survey phases (Identity-lite, A/B/C/E/F), and the gallery instantiation rules all live in the extracted file. Update them there, not here.

## 9. Three-group routing

*Revised 2026-06-08 (v1.1.0 KeyboardIR import). See [docs/spec-amendment-2026-06-08-keyboardir.md](docs/spec-amendment-2026-06-08-keyboardir.md).*

> **Audience.** Primary: content curator (for the three-group taxonomy + authoring emphasis). Secondary: engine implementer (for the BCP47-subtag detection algorithm, Phase A detection gates, and CJK/Ethiopic exclusion enforcement).
> A curator walks away knowing which gallery patterns to surface per group and how reorder priority cascades. An implementer walks away knowing how to detect the group from BCP47 + IR structural shape and how to enforce the CJK/Ethiopic stub. The opening table + reorder-priority list is curator-facing; the "Routing decision" / "No mobile-first routing" / "CJK and Ethiopic" paragraphs are implementer-facing.

The survey branches at Phase A based on BCP47 tag, base-keyboard choice, and user confirmation. The three groups share the same phase structure but differ in authoring emphasis, reordering load, and `&CasedKeys` content.

| Group | Typical bases | Primary challenges | CasedKeys default | Reorder posture |
|---|---|---|---|---|
| QWERTY / QWERTZ | `release/basic/*`, English/German-family | Character substitution, diacritics via deadkeys, occasional RALT/AltGr | `[K_A]..[K_Z]` | NFD normalization; auto-emitted unless base has its own scheme |
| AZERTY | French/Francophone-Africa bases | Position remapping (Q<->A, W<->Z), shifted digits, heavy AltGr layer | `[K_A]..[K_Z] [K_0]..[K_9] [K_HYPHEN] [K_EQUAL] [K_LBRKT] [K_RBRKT] [K_BKSLASH] [K_QUOTE] [K_COMMA] [K_PERIOD] [K_SLASH] [K_COLON]` | NFD normalization; auto-emitted unless base has its own scheme |
| Non-Roman | Curated bases per script family (Indic, Arabic, Hebrew, SEA, etc.) | Character mapping, heavy reordering, script-specific OSK conventions | Typically omitted; survey confirms per script (see decision in Sec 14) | Gallery-picked: pre-base vowel, halant/conjunct, tone-mark, subscript stacking |

**Routing decision.** Group is detected automatically from the BCP47 script subtag (from Phase A) and the IR's structural shape (which scripts its rules already emit), then confirmed with the user in a single plain-language step before the survey continues. Non-Roman group is further sub-routed to a script-family branch (Indic, Arabic, SEA, etc.) that controls which reorder patterns are shown in Phase C'.

**Script is the chosen target, not the language's default.** Because language and script are decoupled (§8 identity-lite), the script subtag that drives routing is the *target* script the author selected — which may be an alternate script for the language. A romanization (`hi-Latn`) routes to QWERTY/alphabetic even though Hindi's default script is Devanagari; an IPA keyboard (`-fonipa`) routes to the alphabetic group with postfix-sequence handling (A3a, §7.1). Routing follows the pair's script, never the language's default script.

**No mobile-first routing (Decision 6).** Routing is over script/layout only; there is no touch-first branch. The desktop/mobile target question (`pa_primary_target`) is **advisory** — it never branches the flow into a touch-first variant. A "mobile" answer still runs the desktop-first survey and produces its touch layout in Phase E, derived from the locked desktop (Sec 8 "Gallery instantiation"). Touch-first authoring is a v1.1 candidate (Sec 16).

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

> **Audience.** Three voices, three readers — separated below.
> - **Governance** assigns each criterion to a band (the Day-1 triage, recorded in `criteria.json`). Read the four-band definitions + the count table.
> - **Engine implementer** enforces bands 1 and 2 (scaffolder bakes them in / Layer C lint catches them). Read the "Enforcement" column.
> - **Content curator** surfaces bands 3 and 4 (yellow-survey questions, red-checklist items in the PR body). Read the "Example criterion" column to understand the author-facing phrasing.

The 133 criteria in `criteria.md` are classified into four enforcement bands per Decision 4 (Sec 14). The Day-1 triage is recorded as a typed `Criterion[]` in `packages/contracts/data/criteria.json`; per-band rationale and any flagged-for-re-review entries live in `packages/contracts/data/criteria-summary.md`.

**Band 1 — scaffolder-bake.** The scaffolder makes violation impossible at template-fill time. The user never sees these as explicit checks because the bad state cannot exist in their virtual FS.

**Band 2 — layer-c-enforce.** The user could violate during authoring; the lint engine catches it on every 300 ms debounce cycle. Layer C blocks phase progression on `error`/`fatal`.

**Band 3 — yellow-survey.** Requires reading and understanding content, consulting a public resource (langtags, Ethnologue, organization website, `s.keyman.com`), or making a judgment call. Surfaced as plain-language survey questions at the relevant phase.

**Band 4 — red-checklist.** Requires out-of-band information no public source records (e.g. original-author permission for a third-party patch). Pre-submit manual checklist; the PR body flags them for the reviewer.

| Band | Count | Example criterion | Enforcement |
|---|---|---|---|
| scaffolder-bake | 40 | "No leading zeros in version components" — regex-checkable, auto-fixable | Scaffolder resets version to `1.0`; further violations cannot be authored. |
| layer-c-enforce | 66 | "BCP47 tag well-formed; modifier names consistent across `.kmn`/`.kvks`/`.keyman-touch-layout`" | Layer C lint engine; blocks phase progression on `error`. |
| yellow-survey | 32 | "BCP47 tag is correct for the language/script" — requires langtags.json lookup and linguistic judgment | Phase A survey asks for the tag; studio cross-checks against langtags.json and flags mismatches for user review. |
| red-checklist | 10 | "If a third party submits a patch to an existing keyboard, original author was consulted" — requires direct author communication | Final checklist item in PR submission flow; PR body includes a reminder block. |

**Total: 148 entries** (the 7.7a split adds 1 entry relative to the original 145-entry Day-1 catalog; the two section-19 import-output criteria add 2 more).

Source-of-truth for the band assignments is `packages/contracts/data/criteria.json` (loadable via `import { ALL_CRITERIA } from "@keyboard-studio/contracts"` or the dedicated `/criteria` subpath). The Day-1 triage closed as issue #6.

---

## 12. Output artifacts

*Revised 2026-06-08 (v1.1.0 KeyboardIR import). See [docs/spec-amendment-2026-06-08-keyboardir.md](docs/spec-amendment-2026-06-08-keyboardir.md).*
*Revised 2026-06-14 (v1.3.0 working-copy spine). Extends Decision 9.*

**Working copy as the live edit target.** The `VirtualFS` is instantiated at keyboard selection (Track 1: `instantiateFromBase`; Track 2: `instantiateFromExisting` — see §8 "Two authoring tracks") and is the session's sole live edit target from that point forward. Every subsequent mutation — carve deletions, survey answers, gallery pattern insertions, OSK edits — is applied to this working copy. Assignments and carve deletions are applied as **re-projected layers on top of the IR**: they do not destructively rewrite IR nodes; instead, the emitter projects the current assignment map and carve state over the base IR at render time, so the original IR structure is always recoverable by unwinding the layers. The working copy is serialized to a `.zip` archive or committed as a fork+PR only at output (step 15) — the studio does not write to disk during authoring, and there is no intermediate persistence step between instantiation and output.

**OSK spacebar caption as a visible identity mutation.** KeymanWeb renders the keyboard's display name on the spacebar caption by default (`spacebarTextMode` = `KEYBOARD`; the host may instead select language, or both via `LANGUAGE_KEYBOARD`), drawing on the `KeyboardIdentity` fields `displayName` and `bcp47`. Because the working copy is the live OSK target, identity edits are immediately visible in the OSK as spacebar caption changes. Script, base-keyboard, carve, and mechanism edits change the key labels. The OSK is therefore a complete observable of the working copy's current state.

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

> **Audience.** Primary: engine implementer (for pass criteria — exit codes, oracle behavior, lint blocking). Secondary: QA / curator (for the scenarios themselves, which read as test vectors).
> Scenarios A–C are author-walkthroughs: a curator or QA reviewer can read them as "what should happen when a typical user does this." Scenario D is lint-engine internals: implementer-only. When grilling, ask register-appropriate questions per scenario — A–C are about user-visible behavior; D is about the validator's enforcement contract.

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
| Authoring plan and component architecture | `docs/KM-Questionnaire.md` in the keyboard-studio repo, or https://github.com/keyboard-studio/keyboard-studio/blob/main/docs/KM-Questionnaire.md |
| Validator / lint architecture (14 compiler checks) | `docs/lint.md` in the keyboard-studio repo, or https://github.com/keyboard-studio/keyboard-studio/blob/main/docs/lint.md |
| PR review criteria (~200 checkpoints, green/yellow/red) | `docs/criteria.md` in the keyboard-studio repo, or https://github.com/keyboard-studio/keyboard-studio/blob/main/docs/criteria.md |
| Template-cleanup recipe (scaffolder source of truth) | `docs/making-a-template.md` in the keyboard-studio repo, or https://github.com/keyboard-studio/keyboard-studio/blob/main/docs/making-a-template.md |
| `.kmn` strategy framework (discovery axes, decision tree, strategy cards S-01..S-12) | Merged into Sec 7 of this spec. `strategy tree/strategies.md` is retained only as a stub pointer — do not treat it as a separate source. |
| GitHub repository | https://github.com/keyboard-studio/keyboard-studio |
| Issue tracker | https://github.com/keyboard-studio/keyboard-studio/issues |
| KeyboardIR schema (full TypeScript) | `packages/contracts/src/keyboard-ir.ts` |
| Import corpus / supportability matrix | `docs/import-corpus.md` (generated by the supportability scanner) |
| ParseKB prior art (Python, separate repo) | `D:\Github\_Projects\_KM\ParseKB` — informs codec design; not a dependency |

Issues #5, #6, #8, and #31 are the critical-path items. Do not reference individual issues in shipped code comments; cross-link via commit messages and PR bodies.

This spec is maintained under the revision policy in Sec 18. The next scheduled review is at the Day-4 integration milestone (issue #31).

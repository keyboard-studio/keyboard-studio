# spec.md amendment proposal — KeyboardIR + Import + Functional Round-Trip (v1.1.0 spec revision)

**Status:** APPLIED to [spec.md](../spec.md) on 2026-06-08. Logged in [docs/spec-signoff.md](spec-signoff.md) under Post-Sign-Off Amendments.

**Provenance:** Synthesized from a 5-turn design conversation (2026-06-08) covering ParseKB prior-art analysis, KeyboardIR schema design, three user corrections (editing existing IS in scope; no multi-source merge; no from-scratch path — US English is always the implicit base), and one consolidation workflow run.

---

## Summary

This amendment closes the largest remaining gap in the v1 spec: support for importing an existing `.kmn` keyboard from `keymanapp/keyboards/release/` (or a user upload) as the starting point of an authoring session. Every session now adapts a single base — US English by default, any basic/release keyboard by user choice, or an upload — through a typed `KeyboardIR` that is parsed in, carved/extended through the existing Pattern survey, and emitted back to `.kmn` under a functional-equivalence round-trip contract (decision **D7**). The amendment removes the v1 exclusion on editing existing keyboards, is explicit that single-source adaptation is the only mode v1 ships, and collapses the "clean vs. adapt" framing into one pipeline whose default source is the US-English base.

## Section-by-section changes

### §1 Elevator pitch

**Change:** Reframe "create" as "create or adapt"; surface single-source adaptation and the US-English default.

Replace the **Solution** paragraph with:

> **Solution.** Keyboard-Studio is a browser-based authoring environment that lets language experts — people who know their language's phonology, orthography, and character inventory but have never written a Keyman keyboard — produce production-ready Keyman keyboards without touching `.kmn` syntax. Every session adapts a **single** base keyboard: the US-English fallback (the default when the user has no existing layout to start from), any `release/basic/` layout, any other `keymanapp/keyboards/release/` keyboard (e.g. a country keyboard the user wants to subset for one language), or an uploaded `.kmn`. Users answer plain-language questions, carve away rules they do not want from the imported base, and choose from live-demoed interaction patterns to add new behaviour. The system compiles in-browser in 100-300 ms per edit using the existing `kmcmplib` WebAssembly (WASM) binary, validates every emission against a real language-aware lint engine, scaffolds a touch layout automatically from desktop rules, and enforces all mechanical criteria by construction.

### §2 Why this exists

**Change:** Add one bullet acknowledging the import use-case.

Append to the bullet list:

> - Existing keyboards in `release/` cannot be adapted without re-authoring by hand: a maintainer who wants to take a multilingual country keyboard (e.g. `cm_qwerty`) and ship a monolingual subset for one language has no path short of hand-editing `.kmn`. Original authors updating their own keyboards face the same friction.

Append a closing sentence to the existing wrap-up paragraph:

> The same machinery serves authors adapting an existing keyboard: the studio parses the chosen `.kmn` into a typed in-memory representation, lets the author carve unwanted rules away and add new ones through the same survey, and re-emits a functionally-equivalent `.kmn`.

### §3 Target user

**Change:** Add a second user-mode paragraph after the existing prose.

Append:

> A secondary user-mode the studio explicitly supports: an **adapting author** who is starting from an existing `release/` keyboard rather than from the US-English base. They may be a community member taking a country-wide keyboard down to a single language, or an original author returning to update their own keyboard. They have the same linguistic knowledge as the primary user; what they additionally have is an existing `.kmn` they want to keep most of. The studio's import path treats this case as the same authoring flow — only the source of the initial in-memory project differs.

### §4 System overview

**Change:** Update the architecture diagram to (a) make the base-keyboard browser the *source-selection* component (basic / any release / upload), (b) insert a codec + recognizer + carve gallery between source selection and the scaffolder, and (c) annotate the validator with the new import-fidelity sub-layer.

Replace the diagram's first four blocks with:

```
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
```

Add to the **validator / lint engine** block:

```
+-- validator / lint engine    [engine]   Three layers (A validity, B style, C hygiene) plus the
|                                         new Layer A' import-fidelity checks I1-I5 (§10) that run
|                                         on every codec parse and on output emission.
```

### §5 Pattern schema

**Change:** Add two optional, additive fields to the `Pattern` interface — `origin` and `ownedNodes`. Non-breaking; locked at the same #5 joint session as `strategyId` / `combinesWith`.

Add to the `Pattern` interface:

```ts
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
```

Add to the preamble:

> The optional `origin` and `ownedNodes` fields are non-breaking additions that link a Pattern instance back to the imported IR it was lifted from; see §5a. They are ratified in the same Day-1 #5 session that ratifies `strategyId` / `combinesWith`.

### §5a KeyboardIR (NEW)

**Change:** New section. KeyboardIR is the Day-1-contract-class typed schema for any imported or scaffolded keyboard.

> ### 5a. KeyboardIR (keyboard intermediate representation)
>
> KeyboardIR is the typed, in-memory representation of a single Keyman keyboard — a lossless model of a `.kmn` plus its sibling `.kvks` and `.keyman-touch-layout` files. **Once a project exists in the studio, the IR is the source of truth (decision D9):** the survey, carve gallery, validator, and scaffolder all read and mutate the IR; the emitter renders the final `.kmn` from the IR; no original-source text round-trips through the rest of the pipeline. The original `.kmn` (for imports beyond the US-English fallback) is preserved as a `<id>.kmn.imported` sidecar for reviewer diff — included in the `.zip` and OAuth working tree but **excluded from the PR commit** itself (§12).
>
> The IR's schema is locked alongside the Pattern schema at the Day-1 #5 joint session; field renames, type changes, and removals are major version bumps of `packages/contracts` per the policy in §18.
>
> ```ts
> /** packages/contracts/src/keyboard-ir.ts — sketch; full types live in the contracts package */
>
> export type IROrigin = "scaffolded" | "imported" | "synthesized";
>
> export interface IRNodeRef {
>   kind: "rule" | "store" | "group" | "touchKey" | "kvksKey" | "comment" | "raw";
>   nodeId: string;
> }
>
> export interface IRHeader {
>   keyboardId: string;
>   name: string;
>   bcp47: string[];
>   copyright: string;
>   version: string;
>   targets: string[];
>   storeDirectives: StoreItem[];
> }
>
> export interface IRStore {
>   nodeId: string;
>   name: string;
>   items: StoreItem[];
>   isSystem: boolean;
> }
>
> export interface IRGroup {
>   nodeId: string;
>   name: string;
>   usingKeys: boolean;
>   rules: IRRule[];
>   readonly: boolean;
> }
>
> export interface IRRule {
>   nodeId: string;
>   context: ContextElement[];
>   output: OutputElement[];
>   trailingComment?: string;
>   ownedByPattern?: string;
> }
>
> export interface IRComment {
>   nodeId: string;
>   text: string;
>   anchor: "leading" | "trailing" | "freestanding";
>   anchorRef?: IRNodeRef;
> }
>
> export interface RawKmnFragment {
>   nodeId: string;
>   origin: "imported";
>   sourceText: string;
>   reason: string;
> }
>
> export interface TouchLayoutIR {
>   layers: Array<{ id: string; rows: Array<{ keys: TouchKeyIR[] }> }>;
>   nodeIds: Map<string, IRNodeRef>;
> }
>
> export interface KvksIR {
>   layers: Array<{ shift: string; keys: Array<{ vkey: string; output: string }> }>;
>   usealtgr: boolean;
>   nodeIds: Map<string, IRNodeRef>;
> }
>
> export interface KeyboardIR {
>   origin: IROrigin;
>   header: IRHeader;
>   stores: IRStore[];
>   groups: IRGroup[];
>   comments: IRComment[];
>   raw: RawKmnFragment[];
>   touchLayout?: TouchLayoutIR;
>   visualKeyboard?: KvksIR;
>   recognizedPatterns: Pattern[];
> }
>
> export enum ImportStatus {
>   Clean = "clean",
>   CleanWithOpaque = "clean-with-opaque",
>   ParseFailure = "parse-failure",
>   RoundTripDivergence = "round-trip-divergence",
> }
>
> export interface ImportReport {
>   keyboardId: string;
>   status: ImportStatus;
>   parseErrors: string[];
>   opaqueFeatureInventory: Array<{ feature: string; count: number }>;
>   recognizedRatio: number;
>   roundTripDiff?: RoundTripDiff;
> }
> ```
>
> Detailed types — `ContextElement`, `OutputElement`, `KeyChord`, `StoreItem`, `TouchKeyIR`, `RoundTripDiff` — live in `packages/contracts/src/keyboard-ir.ts` alongside the sketch above.
>
> **Functional-equivalence round-trip (D7).** Two IRs are equivalent when, for every input in a bounded enumeration corpus (every virtual key × every modifier combination × deadkey paths up to depth 3), the WASM oracle produces the same output character sequence from both. Byte-identity of emitted `.kmn` is not required; the emitter is free to canonicalize whitespace, store ordering, comment placement, and codepoint formatting.
>
> **Sources of an IR.** A KeyboardIR is produced from exactly one of four sources, each routed through the same downstream pipeline:
> 1. The bundled US-English fallback (default when the author has no preference).
> 2. A `release/basic/*` layout chosen from the source-selection browser.
> 3. Any other `keymanapp/keyboards/release/` keyboard chosen from the browser (e.g. adapting `cm_qwerty` for one Cameroonian language).
> 4. A user-uploaded `.kmn` (plus optional sibling `.kvks` / `.keyman-touch-layout`).
>
> v1 ships single-source adaptation only — there is no path that combines IRs from two source keyboards. An author adapting Bafut from three overlapping country keyboards picks the closest single one and carves it down.

### §7 Strategy selection

**Change:** Two narrow additions — the axis vector is computed from `IR + recognizer + survey confirmation`; recognized Patterns participate in axis computation.

In §7.1 (after the opening paragraph and before the table), insert:

> The axis vector is computed from the working IR (§5a), the patterns the recognizer has lifted from it, and the survey's confirmations. The survey augments the IR; it never substitutes for it. For a session starting from the US-English fallback the recognizer typically lifts no patterns and the axis vector comes almost entirely from survey answers; for a session adapting `sil_euro_latin` the recognizer lifts the deadkey families and the axis vector is largely pre-populated, with the survey confirming or correcting. The decision-tree firing order (§7.2) is unchanged.

In §7.5, add a row to the validation table footnote:

> Once import lands, the validation pass also runs against each exemplar's *imported* IR — the round-trip emit must produce the same strategy attribution. A mismatch here surfaces as an `ImportStatus.RoundTripDivergence` for that exemplar in the supportability scanner output (§13).

### §8 Data flow

**Change:** Replace Phase 0 (base selection) and the Phase 1 scaffolding step with the unified source-then-codec-then-carve flow. Phase A through Phase G are unchanged in behaviour; only their input — an IR with possible recognized Patterns — is new.

Replace data-flow steps 1 and 2 with:

> 1. **Source selection.** The source-selection browser offers the user one of four sources for the session: the bundled US-English fallback (preselected), any `release/basic/*` layout, any other `keymanapp/keyboards/release/` keyboard, or an uploaded `.kmn`. The user picks exactly one. There is no multi-source merge.
>
> 2. **Parse to IR.** The KeyboardIR codec (§5a) parses the chosen source's `.kmn`, `.kvks`, and `.keyman-touch-layout` into a `KeyboardIR`. Unrecognized features (save/set/reset/if option-store, call/return, indexed context(n), outs(), SMP 5-digit literals) become `RawKmnFragment` nodes with `origin: 'imported'` (D8). The pattern recognizer then walks the IR and lifts node clusters matching recognizer rules into `Pattern` instances with `origin: 'recognized'` and back-references via `ownedNodes`. Lifted nodes become survey-editable; unlifted nodes stay opaque. The Layer A' import-fidelity checks (I1-I5, §10) run at this point; a parse failure halts the session and surfaces the codec error to the user.
>
> 3. **Scaffold over the IR.** The scaffolder applies identity propagation (resets `header.keyboardId`, `header.bcp47`, `header.copyright`, `header.version`) and the template-cleanup pipeline (NCAPS strip, `[CAPS]` deletion, `&CasedKeys` insertion, touch-layout cleanup) **directly on the IR**. For a US-English-fallback session this is the same template cleanup v1 already performs; for an imported `release/` keyboard the scaffolder runs the same cleanups over the imported IR. Layer C hygiene runs after scaffolding. The author sees a clean-by-construction IR before they touch anything.
>
> 4. **Carve gallery.** Before the Phase A identity survey runs, the carve gallery renders every rule, store, group, touch key, and recognized Pattern in the IR as a card. The author can keep, edit (survey-editable cards only — recognized Patterns and scaffolded slots), or delete each card. For a US-English-fallback session the carve gallery is mostly pass-through (the user typically keeps everything). For an imported `cm_qwerty` adapted to one Cameroonian language, carving away the other languages' rules is the bulk of the work. The mechanism is identical in both cases.

Renumber the remaining steps (former 3 → 5, former 4 → 6, etc.). Within each renumbered step, replace "the project" / "the scaffolded virtual FS" with "the IR" where appropriate; behaviour is unchanged.

Add to the renumbered step 13 (Output):

> The emitter renders the final `.kmn`, `.kvks`, and `.keyman-touch-layout` from the IR (D9). For sessions whose source was not the US-English fallback, the original `.kmn` is preserved as a `<id>.kmn.imported` sidecar in the `.zip` and OAuth working tree; the sidecar is excluded from the PR commit (§12).

### §9 Three-group routing

**Change:** One-line clarification — group detection runs over the IR after the codec parse, not over a base-keyboard ID lookup.

Update the **Routing decision** paragraph:

> **Routing decision.** Group is detected automatically from the BCP47 script subtag (from Phase A) and the IR's structural shape (which scripts its rules already emit), then confirmed with the user in a single plain-language step before the survey continues. Non-Roman group is further sub-routed to a script-family branch (Indic, Arabic, SEA, etc.) that controls which reorder patterns are shown in Phase C'.

### §10 Validator and lint engine

**Change:** New sub-layer A' (import fidelity) with five checks I1-I5.

After the existing "5 checks deferred to the WASM compiler oracle" subsection, insert:

> #### Layer A' — import fidelity (5 checks)
>
> Layer A' runs on every codec parse (after import) and on every emit (before output). It is part of `@keymanapp/kmn-validator`. The checks are:
>
> | # | Check | Severity | When |
> |---|-------|----------|------|
> | I1 | **Parse cleanliness** — the codec parsed the source without falling back to `RawKmnFragment` for *known-supported* features. | `warning` (per fragment) | On import |
> | I2 | **Round-trip functional equivalence** — emit the IR, re-parse, compare against the bounded enumeration corpus (D7); the input→output map must be identical. | `error` | On import and on every emit during authoring |
> | I3 | **Comment preservation** — every `IRComment` with `anchor: 'leading' \| 'trailing'` is emitted attached to the same anchor node it imported with. | `warning` | On emit |
> | I4 | **Recognized ratio** — `ImportReport.recognizedRatio` is reported informationally; no threshold blocks submission. | `info` | On import |
> | I5 | **Unsupported feature inventory** — every `RawKmnFragment` produces one entry in `ImportReport.opaqueFeatureInventory`. | `info` | On import |
>
> A failing I2 halts the authoring session: the IR cannot be trusted as the source of truth (D9) if the emit does not round-trip. I1, I3, I4, I5 are informational/warning and do not block authoring. The supportability scanner CLI (§13) runs the same checks in batch over `release/` and aggregates the reports.

### §12 Output artifacts

**Change:** Add the imported-sidecar rule to the virtual FS layout and to the OAuth PR-body section.

Add to the virtual-filesystem block, immediately under `<id>.kmn`:

```
    <id>.kmn.imported         -- original .kmn from the import source (D9);
                                 present only when source != US-English fallback.
                                 INCLUDED in the .zip; EXCLUDED from the PR commit.
```

Add a bullet to the **GitHub OAuth fork+PR** subsection's PR-body list:

> - Import attribution (when supplied): the source keyboard the session adapted (e.g. `release/c/cm_qwerty`), the round-trip status, and the `ImportReport.opaqueFeatureInventory` for reviewer context. Non-gating.

### §13 Team boundaries

**Change:** Add codec / recognizer / scanner ownership lines and one Day-1 issue (#5b for the KeyboardIR schema lock).

Add to **Engine team owns**:

> - KeyboardIR codec (parse `.kmn` + sibling files into IR; emit IR back to `.kmn`)
> - Carve gallery UI
> - Layer A' import-fidelity checks I1-I5
> - Supportability scanner CLI (`utilities/import-scanner/`), the `docs/import-corpus.md` generator, and the CI job that runs the scanner on codec changes

Add to **Content team owns**:

> - Pattern recognizer rules (which node-cluster shapes lift to which Pattern; curated per script family, the same rigour as new pattern mining)

Add a Day-1 joint-session issue:

> - **#5b** — Lock the KeyboardIR schema (header / store / group / rule / comment / raw fragment / touch / kvks; `IROrigin`, `IRNodeRef`, `ImportStatus`, `ImportReport`). Held jointly with #5; depends on no other issue.

### §14 Open questions — resolved decisions

**Change:** Add three new decisions D7, D8, D9.

Append:

> **Decision 7 — Functional equivalence, not byte-identity.**
> Decision: Round-trip is verified by *functional equivalence under `kmcmplib`*, not by byte-identity of the emitted `.kmn`. Two IRs are equivalent when every input in the bounded enumeration corpus (every virtual key × every modifier combination × deadkey paths up to depth 3) produces the same output character sequence under the WASM oracle. Order, whitespace, comment placement, and codepoint formatting differences are not defects.
> Rationale: Byte-identity is unachievable across the corpus (mined `.kmn` files mix `dk()` and `deadkey()`, varying U+XXXX vs. literal forms, and free-form comment placement). Functional equivalence is the property authors and reviewers actually care about; it is mechanically checkable via the existing WASM oracle.
>
> **Decision 8 — Opaque imports for unrecognized features.**
> Decision: KMN features outside the typed IR — `save()`/`set()`/`reset()` option stores, `if()` over option stores, `call()`/`return()`, indexed `context(N)`, `outs()` store composition, SMP 5-digit `U+XXXXX` literals — are imported as `RawKmnFragment` IR nodes with `origin: 'imported'`. They render in the carve gallery as deletable cards; they are not survey-editable in v1. A lower-level raw-KMN editor is a v1.1 candidate.
> Rationale: These features appear in a small fraction of `release/` keyboards and require substantial typed-IR work each. Treating them as opaque preserves round-trip fidelity (the emitter writes the original text back verbatim) and lets v1 import the long tail of `release/` keyboards without blocking on a complete typed model.
>
> **Decision 9 — IR is canonical; original `.kmn` is a sidecar.**
> Decision: Once a session exists, the KeyboardIR is the source of truth. The emitter always renders from the IR. The original `.kmn` (for imports beyond the US-English fallback) is preserved as a `<id>.kmn.imported` sidecar — included in the `.zip` and in the OAuth working tree for reviewer diff — but is **excluded from the PR commit**. This holds even when no edits are made: a no-edit import still emits a freshly-rendered `.kmn`.
> Rationale: A two-source-of-truth model (IR + original text) drifts the moment any edit lands. Picking one canonical representation (the IR) makes the emitter, validator, and round-trip story all deterministic. The sidecar exists strictly for reviewer convenience during the v1 stabilization window and can be removed entirely in v1.1.

### §15 Acceptance scenarios

**Change:** Update Scenario A's framing to make explicit that the user adapts US-English. Add Scenario F covering an import-and-carve flow.

Replace Scenario A's **Starting state** and the first sentence of **User actions**:

> **Starting state:** Studio open, no authentication, US-English fallback selected as the source. The carve gallery renders a pass-through view (no recognized patterns to suppress).
> **User actions:** Phase A — enters language name "Tuvan", tag `tyv`, copyright holder "Researcher Name". Phase B — adapts the US-English base by adding characters `a e i o u` with acute accent variants. Phase C — selects the "tap then base letter" deadkey pattern; picks `K_QUOTE` as trigger key; lists base `aeiou` and accented `áéíóú`. Phase C' — NFD reorder auto-emitted. Phases D-G complete with defaults. Clicks "Download .zip".

Append a new Scenario F:

> ### Scenario F: Adapting a country keyboard down to a single language
>
> **Starting state:** Studio open; user selects `release/c/cm_qwerty` (a hypothetical multilingual Cameroonian QWERTY) from the source-selection browser. The codec parses it; the pattern recognizer lifts the Bafut deadkey family and the Fulfulde sequence-replace rules into recognized Patterns; remaining language families render in the carve gallery as deletable cards. The Layer A' I2 round-trip check passes; I5 reports two `RawKmnFragment` nodes (an `outs()` composition and a `save()` option store) as info-level entries.
> **User actions:** Carve gallery — the user deletes the Fulfulde, Ewondo, and Duala rule families, keeping the Bafut Pattern intact. Phase A — sets `id = bfd_keyboard`, BCP47 = `bfd-Latn`, copyright = the language community organization. Phase B — confirms the Bafut character inventory pre-populated from the surviving rules; adds two characters the import missed. Phases C-G complete with defaults. Clicks "Submit via GitHub OAuth".
> **Expected output:** Draft PR opened on the user's fork. PR body lists the import attribution (`adapted from release/c/cm_qwerty`, round-trip clean, two opaque features deleted as part of carving). The PR commit contains the emitted `<id>.kmn` but NOT `<id>.kmn.imported`. The `.zip` (if also downloaded) contains both.
> **Pass criteria:** WASM oracle produces no errors. Layer A' I2 passes on every emit during the session. The committed `.kmn` builds with `kmc build` exit code 0. Re-importing the emitted `.kmn` into the studio produces an IR functionally equivalent to the one at submit time.

### §16 Out of scope

**Change:** Remove the "Editing existing keyboards" bullet (correction #1). Add three new exclusions making the v1 boundaries of the import feature explicit.

Delete:

> - **Editing existing keyboards** — the studio creates new keyboards from a base; it does not support round-tripping or editing an uploaded `.kmn`.

Add:

> - **Multi-source merge** — v1 adapts exactly one source keyboard per session (US-English fallback, a `release/` keyboard, or one upload). Combining rules from two sources (e.g. taking deadkeys from one keyboard and a touch layout from another) is not supported. Authors adapting a language covered by overlapping country keyboards pick the closest single source and carve it down.
> - **Survey-editing opaque IR fragments** — `RawKmnFragment` nodes (D8) appear in the carve gallery as deletable cards but cannot be edited through the survey in v1. A lower-level raw-KMN editor is a v1.1 candidate.
> - **Byte-identical round-trip** — round-trip is verified by functional equivalence under `kmcmplib` (D7), not by byte-for-byte preservation of the original `.kmn` text. Whitespace, store ordering, comment placement, and codepoint formatting may change between import and emit.

### §17 Glossary

**Change:** Add five entries.

Append (in alphabetical order):

> **adapting author.** A user-mode the studio supports as a first-class case: an author starting from an existing `release/` keyboard rather than from the US-English fallback. The flow is the same as the primary user-mode; only the source of the IR differs. See §3.
>
> **carve gallery.** The card-view UI that renders an imported IR's rules, stores, groups, touch keys, and recognized Patterns as keep/edit/delete cards. The author carves unwanted material away before the Phase A survey begins. See §4, §8.
>
> **functional equivalence.** Round-trip criterion (Decision 7, §14): two IRs are equivalent when, for every input in the bounded enumeration corpus (every virtual key × every modifier × deadkey paths up to depth 3), the WASM oracle produces the same output character sequence from both.
>
> **KeyboardIR (IR).** The typed in-memory representation of a keyboard. Once a session exists in the studio, the IR is the source of truth (Decision 9, §14); the emitter renders the final `.kmn` from the IR. See §5a.
>
> **pattern recognizer.** The engine + content component that walks an imported IR, lifts node clusters matching curated recognizer rules into `Pattern` instances with `origin: 'recognized'`, and back-references the lifted nodes via `Pattern.ownedNodes`. See §4, §8.
>
> **RawKmnFragment.** An IR node holding KMN syntax that the codec could not map to a typed IR node (e.g. `save()`/`set()`, `call()`, `outs()`, SMP 5-digit literals). Round-trips verbatim; rendered as a deletable card in the carve gallery; not survey-editable in v1. See Decision 8, §14.

### §18 Revision policy

**Change:** One sentence acknowledging KeyboardIR is held to the Pattern-schema bar.

Append:

> Changes to the KeyboardIR schema (§5a) — field renames, type changes, removals — follow the same policy as the Pattern schema: joint engine+content session required; breaking changes require a major version bump of `packages/contracts`. Adding new typed nodes for features currently held as `RawKmnFragment` (Decision 8, §14) is a minor revision, not a breaking change.

### §19 Reference

**Change:** Add three references.

Append rows:

| Document | Location |
|---|---|
| KeyboardIR schema (full TypeScript) | `packages/contracts/src/keyboard-ir.ts` |
| Import corpus / supportability matrix | `docs/import-corpus.md` (generated by the supportability scanner) |
| ParseKB prior art (Python, separate repo) | `D:\Github\_Projects\_KM\ParseKB` — informs codec design; not a dependency |

## Issue tracker impact

### Existing issues to amend

- **#5 (Lock Pattern schema).** Amend: extend the contract-lock to include the two new optional `origin` and `ownedNodes` fields. Hold jointly with #5b below.
- **#8 (Service interfaces in `packages/contracts`).** Amend: add `KeyboardIR`, `IROrigin`, `IRNodeRef`, `ImportStatus`, `ImportReport`, `RawKmnFragment` to the contracts inventory. The export surface from `@keyboard-studio/contracts` grows accordingly.

### New issues to create

Following the `<prefix>(<area>): <description>` style from CLAUDE.md:

1. `epic: KeyboardIR import + functional round-trip (v1.1 spec revision)` — umbrella tracker for the work below.
2. `feat(contracts): KeyboardIR schema + IR node types + ImportStatus / ImportReport` — closes the Day-1 lock; gates everything else. **(#5b)**
3. `feat(engine): KeyboardIR codec — .kmn / .kvks / .keyman-touch-layout parser and emitter`
4. `feat(engine): pattern recognizer — lift IR node clusters into Patterns with origin='recognized'`
5. `feat(studio): carve gallery — keep/edit/delete card view over the working IR`
6. `feat(engine): Layer A' import-fidelity checks I1-I5 in @keymanapp/kmn-validator`
7. `feat(tools): supportability scanner CLI — runs codec + Layer A' over release/, emits docs/import-corpus.md, wired into CI on codec changes`
8. `feat(scaffolder): scaffold-over-IR — apply identity propagation and template-cleanup pipeline directly on KeyboardIR nodes`
9. `feat(output): .kmn.imported sidecar — include in .zip and OAuth working tree, exclude from PR commit, add import-attribution block to PR body`
10. `feat(content): pattern recognizer rule curation — first pass covering S-01..S-09 idioms across the basic/ pool and Latin SIL keyboards`
11. `docs(spec): apply the §1/§2/§3/§4/§5/§5a/§7/§8/§9/§10/§12/§13/§14/§15/§16/§17/§18/§19 amendments from this proposal` — **this commit closes it**
12. `chore(criteria): add criteria.md rows for import-attribution PR-body and sidecar-exclusion-from-commit`

### Critical-path ordering

1. **Day-1 #5b** (contracts lock for KeyboardIR) — gates everything; runs in the same joint session as #5.
2. **#11** (apply the spec amendment) — **DONE 2026-06-08**.
3. **Codec + scaffolder-over-IR** (#3, #8) — minimum viable path: import US-English fallback, round-trip emit, prove I2 passes.
4. **Carve gallery + recognizer** (#4, #5) — adds the value-add for imports beyond US-English.
5. **Supportability scanner + content recognizer rules** (#7, #10) — gives us the per-keyboard status table that drives which imports are advertised in the source-selection browser.
6. **Sidecar + PR-body wiring** (#9) — last, because it depends on everything above being stable.

## Open questions to resolve before the #5b joint session

1. **Recognizer rule format.** Are recognizer rules expressed as TypeScript predicates over IR nodes (engine-owned, code), as a declarative content-team YAML schema (parallel to Pattern YAML), or as both (content-authored YAML compiled to a TS predicate at build time)? Affects who owns extending the recognizer.
2. **Sidecar removal in v1.1.** Decision 9 leaves the `<id>.kmn.imported` sidecar as a v1 stabilization aid. Decide now whether v1.1 removes it unconditionally, retains it for opt-in, or replaces it with a richer in-repo diff artifact.
3. **Bounded enumeration corpus size.** Decision 7 specifies "deadkey paths up to depth 3" — confirm the depth and document the corpus generation algorithm in `packages/contracts`. Depth 3 covers all observed `release/` keyboards but is not formally justified.
4. **`RawKmnFragment` boundaries.** Decision 8 lists save/set/reset/if option-store, call/return, indexed `context(n)`, `outs()`, and SMP 5-digit literals as opaque. Confirm this list is complete by running the supportability scanner over `release/` *before* the joint session and surfacing any additional features the codec falls back on.
5. **Provenance attribution on import.** When a user adapts `release/c/cm_qwerty` into a new monolingual keyboard, does the original keyboard's author appear in the new `LICENSE.md`, the new `HISTORY.md`, the PR body only, or all three? Affects criteria.md §11 triage rows and the OAuth PR-body template.

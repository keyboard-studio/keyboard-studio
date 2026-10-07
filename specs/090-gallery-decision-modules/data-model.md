# Data Model: Gallery Decision Modules (specs/090-gallery-decision-modules)

All types live in `packages/studio`. Nothing in `packages/contracts` changes.
Shapes marked **PROPOSED — PENDING OWNER RULING** are not settled; see
research.md R8 and the choice-point task T003 in tasks.md.

## Gallery decision module (extends `QuestionModule`, per 089)

One module per settled decision below, registered in
`survey/questions/registry.ts` in a `gallery` group (research R2). Exactly one
provider per decision — the registry's `decisionIndex` throws on a duplicate.

| Field | Type | Notes |
|---|---|---|
| `provides` | `[DecisionId]` (one) | the step's settled decision |
| `requires` | `DecisionId[]` | copied verbatim from the step's declaration in `steps/stepDependencies.ts` (table below), so 091 can delete `settles` without moving anything |
| `renderer` | `ComponentType<DecisionRendererProps<Value>>` | the existing step component, unchanged visually; `"question"` for none of these (FR-001's literal rename is research Q2) |
| `apply` | `(value, ctx) → WorkingCopyPatch` | pure: reads only `ctx` (IR, value, `requires` inputs); writes no store (FR-005, SC-005). Runs through 089's runner + declared-`writes` check |
| `writes` | `IRPath[]` | declared per module; the in-place rewrites it owns (MARKS guards, R1, R2, deadkey ops, context tolerance) must fall inside it |
| `extract` | optional | only where a starting-point seed exists today (e.g. the `pb_character_inventory` spike's `buildProducedSet` probe, folded into `character-inventory`); live extraction is 092's work |
| `validate` | optional | where the value has a checkable shape (non-empty inventory, known layout id) |

`DecisionRendererProps<T>` (FR-001) gains two fields over today's
`{ value, onChange, decisionId }`:

| Field | Type | Notes |
|---|---|---|
| `provenance` | `DecisionProvenance` | of the current record in `decisionStore` |
| `source` | `string?` | the starting point's id when `provenance === "extracted"`, so the renderer can show "from <keyboard>" from props alone |

## The fourteen decisions

`requires` are the step's verified declarations at `07356c2f`
(`steps/stepDependencies.ts`); they become the module's `requires` unchanged.

| Decision id | Module's renderer (existing component) | `requires` | Value (below) |
|---|---|---|---|
| `windows-layout` | `LayoutStep` | `language-code` | `WindowsLayoutValue` |
| `base-keyboard` | `BaseResolutionAdapter` | `language-code`, `target-script` | `BaseKeyboardValue` |
| `character-inventory` | `CharactersStep` | `target-script`, `authoring-track`, `project-keyboard-id` | `CharacterInventoryValue` |
| `marks-treatment` | `MarksSeriesStep` (+ `ContextToleranceStation`) | `character-inventory` | `MarksTreatmentValue` |
| `punctuation-inventory` | `PunctuationStep` | `character-inventory` | `InventoryDecisionValue` |
| `invisibles-inventory` | `InvisiblesStep` | `character-inventory` | `InventoryDecisionValue` |
| `retained-convenience-chars` | `ConvenienceCharsStep` | `character-inventory`, `base-keyboard` | `RetainedConvenienceCharsValue` |
| `carved-layout` | `CarveGalleryV2` | `base-keyboard`, `windows-layout`, `marks-treatment`, `punctuation-inventory`, `invisibles-inventory`, `retained-convenience-chars` | `CarvedLayoutValue` (**PROPOSED — PENDING OWNER RULING** in part) |
| `deadkeys-defined` | deadkey editors via `DeadkeyAdapter` | `carved-layout` | `DeadkeysDefinedValue` |
| `rule-set` | `RulesStep` | `deadkeys-defined`, `windows-layout` | `RuleSetValue` |
| `physical-layout` | `MechanismGallery` | `carved-layout`, `deadkeys-defined`, `rule-set`, `marks-treatment`, `windows-layout` | `PhysicalLayoutValue` |
| `touch-seed-source` | `TouchSeedSourcePanel` | `physical-layout` (+ the step's `gatedBy`: asked only while unrecorded) | `TouchSeedSourceValue` |
| `touch-layout` | `TouchGallery` | `physical-layout`, `touch-seed-source` | `TouchLayoutValue` |
| `help-docs` | `PhaseFGate` wrapping the Phase F factory component | `physical-layout`, `touch-layout` | owned by 089 (the flow's `help-docs` value); 090 registers the gallery host + log entry only (research Q3) |

## Value shapes

Values are what the renderer reports through `onChange` and what `apply`
consumes. Where a value is a collection, **every item carries provenance**
(FR-006). Record-level provenance lives on the decision record (088), not
repeated inside the value, except where noted.

### `WindowsLayoutValue`
`{ layoutId: string, origin: "proposed" | "confirmed" | "overturned" }` — the
shape `savePickedWindowsLayout` already persists as an answer
(`lib/layoutFamily.ts:92-104`); the picker's proposal-vs-picked distinction
survives as data, not as an answer-store origin field.

### `BaseKeyboardValue`
The chosen starting point's identity (the `BaseKeyboard` catalog record the
adapter resolves today: id + the resolved local base). `apply` is a no-op on
the IR in 090 — working-copy setup stays where StudioShell/reducer R3 does it
(setup becomes a decision's `apply` in 092, per 089's edge-case note for
`authoring-track`). The module's job in 090 is recording the decision and
reporting through `onChange` instead of `setLocalBase` / `setBaseConfirmed`.

### `CharacterInventoryValue`
The confirmed alphabet plus the Phase B accept/decline state that
`phaseBDraftStore` holds today for characters: confirmed graphemes, accepted
and declined proposals (each with the draft provenance `phaseBDraftStore`
already tracks — `DraftProvenance` in
`stores/phaseBDraftStore.ts:69`), font choice, and discovery-method state the
step records. Exact field-for-field mapping from `PhaseBDraftState` is US2's
first implementation task; the invariant is that **no Phase B state the step
reads today lives outside this value** after US2, except renderer-internal
draft state (research R3). The spike module `pb_character_inventory` is
retired into this module (research R2); its `extract` is the candidate seed.

### `MarksTreatmentValue`
A composite (research R1): per-mark attachment choices
(`marks_attachment.*`), class and per-mark treatment (`marks_treatment.*`),
promoted marks, input order, output form (`marks_output_form.form`), stacking
rules (`marks_stacking.*`), and the context-tolerance outcome (the station's
accept/decline with its offer attached — the proposal type already exists in
`decisions/contextToleranceProposal.ts`). `apply` performs both IR rewrites
that today live outside the step: `applyMarkGuards` (reducer MARKS) and the
context-tolerance patch (`CONTEXT_TOLERANCE_WRITES`).

### `InventoryDecisionValue` (punctuation, invisibles)
`{ accepted: Item[], declined: Item[] }` — the accept/decline pairs
`phaseBDraftStore` holds today (`InvisibleDecision = "accepted" | "declined"`
per notation, `stores/phaseBDraftStore.ts:77`), each item carrying its
per-item provenance (FR-006): `extracted` for a starting-point proposal,
`asked` for a hand addition/removal decision, `derived` for a computed one.

### `RetainedConvenienceCharsValue`
The retained convenience-character set (today: the `convenience` answer plus
its mirror in `workingCopyStore.session.retainedConvenienceChars` — after
US2 the mirror is an applied view or a selector over this value, not a second
record).

### `CarvedLayoutValue` — **PROPOSED — PENDING OWNER RULING**
```ts
interface CarvedLayoutValue {
  removals: CarveRemovalItem[];               // shape below: PROPOSED
  dispositions: CarveDisposition[];           // contracts type, unchanged, own provenance (research R8)
  closedKeyboardCard: "accepted" | "declined" | null;
}
interface CarveRemovalItem {                  // PROPOSED — Candidate A
  kind: "node" | "item" | "family" | "char";  // deletedNodeIds | deletedItemIds | disabledFamilyIds | carveChars
  id: string;
  provenance: "asked" | "derived" | "extracted";  // asked = hand removal, derived = accepted proposal, extracted = from the starting point
}
```
The four removal collections are one item list discriminated by `kind` (the
four id spaces stay distinct — `workingCopyStore.ts:568-607` documents that
`deletedItemIds` and `deletedTouchKeyIds` are different spaces, and node/item
ids likewise). The per-item `provenance` field above is **Candidate A** from
research R8, written here as the working shape only. Candidate B (mirror
spec 014's agency object per item) would replace the `provenance` field with
`agency`/`source`. **US3 does not implement against this shape until the
ruling is recorded (tasks.md T003).** Orphaned hand-set items stay in
`removals` and are shown, never dropped (spec edge case, spec 014 R6).

### `DeadkeysDefinedValue`
`{ ops: DeadkeyOp[] }` — the op list `workingCopyStore.deadkeyOverlay.ops`
holds today. `apply` replays the ops through the existing patch construction
(`editors/deadkey/deadkeyWrite.ts` + `DEADKEY_WRITES`) instead of the
component calling `commitDeadkeyOp`.

### `RuleSetValue`
The rule builder's result — the rules the author built in `RulesStep`, which
today are builder-owned state discarded at `onComplete(undefined)`. US3
defines the serializable shape from the builder's own types; the requirement
is only that completing the step records *this* value, so the step leaves a
decision (and, per US5, a log entry).

### `PhysicalLayoutValue`
`{ assignments: Assignment[] }` — what `recordAssignments` stores into
`phaseResults` today, each assignment keeping the provenance it already
carries (hand-set vs suggested; `repropagate` refreshes suggested ones).
`apply` performs R1's `lockDesktop()` consequence as a patch-level effect of
the value, replacing the reducer's completion hook.

### `TouchSeedSourceValue`
`"import-adapt" | "reseed-from-desktop"` — the existing union
(`steps/reducer.ts:174`), now a decision value instead of a session field
(088 already removed the field; 090 removes the panel's direct write).

### `TouchLayoutValue`
```ts
interface TouchLayoutValue {
  ops: KeyEditOp[];              // keyEditOverlay.ops today
  deletedTouchKeyIds: string[];  // a different id space from carve's deletedItemIds
  // per-key provenance rides on the ops/keys in spec 014's vocabulary:
  // "base-derived" | "physical-suggested" | "hand-set" — unchanged (US4, FR-006)
}
```
`touchDraft` / the serialized JSON are **not** part of the value: they are
the applied view, produced by `apply` doing R2's `buildTouchLayoutJson` +
`setTouchLayoutJson` work. Orphaned hand-set keys stay in the value and are
shown (spec 014 R6).

## Applied view (not a value)

Until 093, the working copy keeps its overlay fields
(`deletedNodeIds`, `deletedItemIds`, `disabledFamilyIds`, `carveChars`,
`carveDispositions`, `closedKeyboardCard`, `deadkeyOverlay`,
`keyEditOverlay`, `deletedTouchKeyIds`, `touchDraft`) — written **only** by
the owning module's `apply` via the runner (FR-004). `phaseResults` entries
written by `recordAssignments` become the applied view of `physical-layout`.
`undoStack` operates on decision values (research R5).

## Retired shapes

| Shape | Retired by |
|---|---|
| `phaseBDraftStore` (whole store) | US2 (characters/punctuation/invisibles slices move into values) |
| Gallery answers in `surveyAnswerStore` (layout, marks, punctuation, convenience, characters additions) | US1 + US2; the store then holds only within-step view position (`position`, step status) |
| Overlay fields as independently-written state | US3 + US4 (they remain as the applied view) |
| `settles` strings in `stepDependencies.ts` | become redundant in 090 (modules provide the same ids); deleted by 091 |
| Spike module `pb_character_inventory` | US2 (folded into `character-inventory`, research R2) |

## Validation rules (from the FRs)

- FR-002: every `settles` id has exactly one module with `provides`,
  `requires`, `apply`, `renderer` — checked by `decisionIndex` (duplicate
  provider throws) plus a coverage test listing all fourteen ids.
- FR-003 / SC-002: no renderer/adapter/gallery component calls a working-copy
  setter, a `surveyAnswerStore` save, or a session setter — lint layers of
  research R4, zero exceptions.
- FR-005 / SC-005: each `apply` is deterministic under frozen stores — same
  (IR, value, inputs) in, same patch out.
- FR-006: collection items without a provenance field fail the module
  contract tests (touch items: the spec 014 vocabulary counts as theirs).
- FR-008 / SC-003: completing any step records exactly one decision-log entry
  per decision it settles.

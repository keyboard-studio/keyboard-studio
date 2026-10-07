# Research: Gallery Decision Modules (specs/090-gallery-decision-modules)

Series position: 3 of 6. Depends on 088 (live `decisionStore`, records keyed by
decision id, `DecisionProvenance` gains `"derived"`) and 089 (`apply(value, ctx)`
on question modules, the single patch runner through `applyMutatePatch`, and the
golden walk of 089 SC-001). Every statement about today's code below was verified
on this branch at `07356c2f` (pre-088 code); where the post-088/089 state will
differ, that is said explicitly.

## R1 — The HANDOFF write-site table, verified against the code

**Decision:** plan against the verified table below, not the HANDOFF table
verbatim. The HANDOFF's substance is right — every one of the fourteen steps
writes straight to stores and none has a module — but several component names
and locations are stale, and two steps are materially more complex than the
table suggests.

| step (decision) | verified renderer / component today | verified writes |
|---|---|---|
| layout (`windows-layout`) | [LayoutStep.tsx](../../packages/studio/src/survey/layout/LayoutStep.tsx) | `savePickedWindowsLayout` ([layoutFamily.ts:92-104](../../packages/studio/src/lib/layoutFamily.ts)) → `surveyAnswerStore.saveAnswer("layout", "host_layout", …)`, called at LayoutStep.tsx:69,73 with a confirmed/overturned flag |
| choose_base (`base-keyboard`) | `BaseResolutionAdapter` ([panelAdapters.tsx:188](../../packages/studio/src/editors/adapters/panelAdapters.tsx)) | `setLocalBase` / `setBaseConfirmed` on `surveySessionStore` (:191-192, 211-220); working-copy setup happens later in StudioShell → reducer R3 |
| characters (`character-inventory`) | `CharactersStep` + `PhaseB` | `phaseBDraftStore` (accept/decline, draft picks — see [phaseBDraftStore.ts](../../packages/studio/src/stores/phaseBDraftStore.ts)); `saveAnswer` for per-grapheme additions (CharactersStep.tsx:121-125); session sub-stage setters |
| marks (`marks-treatment`) | `MarksSeriesStep` | **Many** `saveAnswer` ids, not one: `marks_attachment.*`, `marks_treatment.class.*`, `marks_treatment.mark.*`, `marks_treatment.promoted`, `marks_treatment.input_order`, `marks_output_form.form`, `marks_stacking.*` (MarksSeriesStep.tsx:354-632, plus prefill writes :976-1032); reducer MARKS handler runs `applyMarkGuards` → `setWorkingIR` ([reducer.ts:358-382](../../packages/studio/src/steps/reducer.ts)); context tolerance is a station inside the series ([ContextToleranceStation.tsx](../../packages/studio/src/survey/marks/ContextToleranceStation.tsx)) whose patch goes through `CONTEXT_TOLERANCE_WRITES` |
| punctuation (`punctuation-inventory`) | `PunctuationStep` | `phaseBDraftStore`; one inventory `saveAnswer` (PunctuationStep.tsx:467) |
| invisibles (`invisibles-inventory`) | `InvisiblesStep` | `phaseBDraftStore` only: `acceptInvisible` / `declineInvisible` per notation; no `saveAnswer` |
| convenience (`retained-convenience-chars`) | `ConvenienceCharsStep` | `saveAnswer("convenience", …)` (ConvenienceCharsStep.tsx:245); the retained set is also mirrored in `workingCopyStore.session.retainedConvenienceChars` (read by carve) |
| carve (`carved-layout`) | `CarveGalleryV2` ([editors/carve/CarveGalleryV2.tsx](../../packages/studio/src/editors/carve/CarveGalleryV2.tsx)) | working-copy overlay actions `cascadeDelete` / `cascadeRestore` / `restoreAll` / `keepAll`, `prefillCarveDispositions` (:703-712, 825); overlay fields `deletedNodeIds`, `deletedItemIds`, `disabledFamilyIds`, `carveChars`, `carveDispositions`, `closedKeyboardCard` ([workingCopyStore.ts:568-651](../../packages/studio/src/stores/workingCopyStore.ts)); `applyCarveMutate` runs in the projection ([projectWorkingCopyVfs.ts:447-504](../../packages/studio/src/lib/projectWorkingCopyVfs.ts)) |
| deadkeys (`deadkeys-defined`) | deadkey editors ([editors/deadkey/](../../packages/studio/src/editors/deadkey)) | components call `workingCopyStore.commitDeadkeyOp`; the op is turned into a patch by [deadkeyWrite.ts](../../packages/studio/src/editors/deadkey/deadkeyWrite.ts) through `applyMutatePatch` with `DEADKEY_WRITES` ([editorMutate.ts](../../packages/studio/src/steps/editorMutate.ts)) → `setWorkingIR`; the op log lives in `workingCopyStore.deadkeyOverlay.ops` |
| rules (`rule-set`) | `RulesStep` ([survey/rules/RulesStep.tsx:46](../../packages/studio/src/survey/rules/RulesStep.tsx)) | builder-owned state; `onComplete(undefined)` — no value, no store write, no log entry |
| mechanisms (`physical-layout`) | `MechanismGallery` ([editors/assignLoop/MechanismGallery.tsx](../../packages/studio/src/editors/assignLoop/MechanismGallery.tsx)) | `recordAssignments` on `workingCopyStore` (:1568, 2646) into `phaseResults`; reducer R1 `lockDesktop()` on completion ([reducer.ts:384-386](../../packages/studio/src/steps/reducer.ts)); `repropagate` refreshes suggested assignments |
| touch_seed_source (`touch-seed-source`) | `TouchSeedSourcePanel` ([editors/touchSeedSource/TouchSeedSourcePanel.tsx:359](../../packages/studio/src/editors/touchSeedSource/TouchSeedSourcePanel.tsx)) | `setTouchSeedSource` on `surveySessionStore` (after 088 this session field is deleted — the panel's write becomes a decision record; see R6 note) |
| touch (`touch-layout`) | `TouchGallery` ([editors/assignLoop/TouchGallery.tsx](../../packages/studio/src/editors/assignLoop/TouchGallery.tsx)) | `setTouchDraft` (:1917, 4115), `deleteTouchKey` (:1781); overlay `keyEditOverlay.ops`, `deletedTouchKeyIds`, `touchDraft`; reducer R2 `setTouchLayoutJson` on completion |
| help (`help-docs`, gallery part) | `PhaseFGate` wrapping `PhaseFStepFactoryComponent` ([registerEditorSteps.ts:281](../../packages/studio/src/steps/registerEditorSteps.ts), [PhaseFGate.tsx](../../packages/studio/src/editors/adapters/PhaseFGate.tsx)) | the gate itself only reads session navigation (`backToUnfinishedGallery`); the value writes are the Phase F flow's — 089 moves those into `apply`. 090's help slice is the host/log wiring, not a second write path (see Open Questions Q3) |

**Discrepancies from the HANDOFF table, for the record:**

- `CarveGalleryV2` lives in `editors/carve/`, not beside the survey steps; the
  touch and mechanisms galleries live in `editors/assignLoop/`. The
  `AddTouchAdapter` / `AddPhysicalAdapter` names in the HANDOFF do not exist in
  `panelAdapters.tsx` on this branch.
- Marks is a **composite** value assembled from many answer records plus two
  IR-rewrite paths (MARKS guards, context tolerance), not a single answer.
  US2's `marks-treatment` value shape must be designed as a composite
  (data-model.md), not renamed 1:1 from one answer id.
- Deadkey ops **already** travel a declared-writes mutate path
  (`deadkeyWrite.ts` + `DEADKEY_WRITES`). US3 changes the *recording* (the op
  list becomes the decision value, replayed by `apply`) more than the patch
  math — the existing patch construction is reused inside `apply`.
- `pb_character_inventory` **does** exist and provides `character-inventory`
  with a custom renderer (`InventoryRenderer`), `extract` and `writes: []` —
  but it is in **no flow and no registry** (imported only by
  `test/sc004Harness.ts` and tests). It is a shape precedent, not the live
  settler: the live settler is `CharactersStep`. See R2 for the collision this
  creates.

**Alternatives considered:** planning straight from the HANDOFF table
(rejected — the marks composite and the deadkey mutate path change the task
shapes); re-verifying after 088/089 land instead of now (rejected — the
stacked-branch series plans all six specs up front; the implementer of each
story re-verifies its own rows as its first task, which is written into
tasks.md).

## R2 — Where gallery modules live, and the one-provider rule

**Decision:** gallery decision modules are `QuestionModule`s registered in the
same registry as question modules ([survey/questions/registry.ts](../../packages/studio/src/survey/questions/registry.ts)),
in a new `gallery` module group beside the flow groups, so `decisionIndex`
(exactly one provider per decision — a duplicate provider throws at load),
`orderByDependencies`, and the `decisionIRConsistency` lint all see them with
no new machinery. Each module declares the **same `requires`** its step
declares today in [stepDependencies.ts](../../packages/studio/src/steps/stepDependencies.ts)
(the verified list is in data-model.md), so when 091 deletes `settles`, the
derived order is unchanged and the parity tests stay green.

**Consequence that must be planned, not discovered:** when the real
`character-inventory` module lands (US2), the spike module
`pb_character_inventory` — which also provides `character-inventory` — must be
retired or folded into it in the same change, or `decisionIndex` throws.
`InventoryRenderer` is **not** the live renderer (visual changes are out of
scope; the live renderer is the existing `CharactersStep`); the spike module's
`extract` (`buildProducedSet` over the starting point) is a candidate seed for
the real module's `extract`, which 092 will run live.

**Alternatives considered:** a separate gallery-module registry (rejected —
two registries is the duplication this series exists to remove, and Article IX
names one registry as the source of order); leaving `pb_character_inventory`
in place and giving the gallery module a different decision id (rejected —
`character-inventory` is the id `stepDependencies` and downstream `requires`
already name).

## R3 — The renderer contract and its host

**Decision:** follow the spec's FR-001 with one flagged deviation from today's
code. Today the field is
`renderer?: "default" | React.ComponentType<DecisionRendererProps<any>>`
([survey/types.ts:334](../../packages/studio/src/survey/types.ts)) and
`DecisionRendererProps<T>` is `{ value, onChange, decisionId }`
([decisionTypes.ts:187-191](../../packages/studio/src/decisions/decisionTypes.ts)).
Nothing reads `module.renderer` at runtime, and no module uses the `"default"`
string literal (only `pb_character_inventory` sets a component). The plan:

- Rename the literal `"default"` → `"question"` per FR-001's wording. Cost is
  contained (one type literal, the question-module snapshot) precisely because
  the literal is unused at runtime. Recorded as Open Question Q2 — if the
  owner prefers the code's word, the rename task is dropped, nothing else
  changes.
- `DecisionRendererProps` gains `provenance` and `source` (FR-001), so a
  renderer can show "from <keyboard>" — displayed from props, never read from
  a store.
- A **gallery host** becomes the first runtime reader of `module.renderer`:
  the manifest step component for a migrated step resolves the step's settled
  decision to its module and renders `module.renderer` with the current
  decision value from `decisionStore`; the renderer's `onChange(value)` is
  the only exit — the host records the decision in `decisionStore` and runs
  the module's `apply` through 089's runner. Steps keep their manifest
  entries until 091; the host replaces the per-step adapter wiring, not the
  step.
- A renderer's in-progress draft (carve's live overlay for the OSK preview,
  touch's draft) stays renderer-internal state, per the spec's edge cases:
  it is never saved, never read by another component, and reaches the store
  only via `onChange` at commit points the renderer already has today.

**Alternatives considered:** letting each existing adapter keep dispatching
and only swapping its writes (rejected — `module.renderer` would remain
declared-but-unused, HANDOFF G6 unfixed, and FR-002's "a module with a
renderer" would be untestable); a new `DecisionModule` type beside
`QuestionModule` (rejected — spec says extend `QuestionModule`; 087/089
already built `apply`, the runner, and the registry on it).

## R4 — Enforcing FR-003 (no store writes from renderers)

**Decision:** two layers, because no single tool sees the whole violation
class:

1. **Import direction (depcruise).** A forbidden rule in
   [.dependency-cruiser.cjs](../../.dependency-cruiser.cjs): decision-module
   files (the `gallery` module group and their `apply` helpers) may not
   import any store under `stores/` — `apply` is a pure function of
   (IR, value, inputs), which is also what makes SC-005's frozen-stores test
   meaningful. `pnpm depcruise` already runs in the `pnpm lint` chain.
2. **Call-site audit (ESLint + a named checker test).** Renderer components
   legitimately *read* stores today (selectors for the IR, the base, session
   navigation), so an import ban on stores would break reads, not just
   writes. The write ban is therefore enforced on call sites: an ESLint
   `no-restricted-syntax` / restricted-import overlay for the migrated
   component trees banning the named write actions (`saveAnswer`,
   `setLocalBase`, `setBaseConfirmed`, `setTouchSeedSource`,
   `cascadeDelete`, `cascadeRestore`, `restoreAll`, `keepAll`,
   `prefillCarveDispositions`, `commitDeadkeyOp`, `recordAssignments`,
   `setTouchDraft`, `deleteTouchKey`, `setWorkingIR`, phaseBDraft
   accept/decline actions), plus a checker test that greps the same trees
   for those identifiers so a renamed alias cannot slip past the lint rule.
   SC-002 requires the rule to pass with **zero exceptions** — an allowlist
   that does not shrink to empty fails the spec.

Layer 1 lands in the Foundational phase; layer 2's identifier list grows per
story **in the same change** that migrates that story's components, so the
rule is never red between stories.

**Alternatives considered:** depcruise alone (rejected — it sees imports, not
calls; `useWorkingCopyStore((s) => s.ir)` and `…((s) => s.cascadeDelete)` are
the same import); a bespoke AST checker script (rejected as first choice —
ESLint already runs per-file in the lint chain; the grep checker is the
backstop, not the primary).

## R5 — Decision values vs the applied view, and drafts

**Decision:** FR-004's split is implemented literally. The decision **value**
(in `decisionStore`, saved in the draft's `decisions` slice per 088 FR-007) is
the only truth. The working-copy overlay fields (`deletedItemIds`,
`keyEditOverlay`, `deadkeyOverlay`, …) remain as fields until 093, but after
090 they are an **applied view**: written only by the owning module's `apply`
(through the runner, calling the existing store actions), never by a
renderer. Both are written in the same commit (record decision → run
`apply`), so within a session they cannot diverge. On draft load, the saved
working-copy slice and the saved decisions were written together by the 088
envelope, so resume reproduces both consistently; full replay-from-decisions
on load is 093's work, explicitly not pulled forward. Undo (`undoStack`,
[workingCopyStore.ts:612](../../packages/studio/src/stores/workingCopyStore.ts))
is re-pointed to operate on the decision value: an undo records the previous
value as a new decision (and re-runs `apply`), instead of popping an overlay
beside it.

**Alternatives considered:** deleting the overlay fields in 090 and deriving
the projection from decision values on every read (rejected — that is 093's
replay architecture; pulling it forward would break the per-story
independence the spec requires, and the projection
([projectWorkingCopyVfs.ts](../../packages/studio/src/lib/projectWorkingCopyVfs.ts))
reads the overlay fields in many places).

## R6 — Decision-log entries for gallery decisions (US5)

**Decision:** recording moves from answer-driven to decision-driven for
migrated steps. Today `recordStepCompletion`
([reducer.ts:549-582](../../packages/studio/src/steps/reducer.ts), called from
[StepHost.tsx:451](../../packages/studio/src/components/StepHost.tsx)) builds
log entries from a step result's `answers` — which is exactly why `layout`,
`rules`, `touch_seed_source`, `deadkeys`, and usually `punctuation` and
`convenience` leave none (HANDOFF G7): their results carry no answers. After
088 the log is keyed by decision id, so each gallery module's completion
records one entry for its decision through the same recorder, with the
decision's provenance (and per-item provenance where the value carries it).
US5 is sequenced **last** and its acceptance is SC-003 measured over every
step, including the ones that already record — the check is "exactly one
entry per decision", so double-recording a migrated step fails it.

**Note on the post-088 baseline:** 088 deletes `selectedTrack` and
`touchSeedSource` as session fields (088 FR-005). US1's
`touch_seed_source` task therefore does not "remove" that setter — it is
already gone or already a selector when 090 starts; the task converts the
panel's *write* into the module's `onChange` → decision record. Each story's
first task re-verifies its R1 rows against the landed 088/089 code for
exactly this reason.

## R7 — The golden walk is the per-story landing gate

**Decision:** every user story ends with the same gate, run in this order:
(1) 089 SC-001's golden walk — the scripted Playwright walk in `pnpm dev`
(copy track from `basic_kbdfr`, fixed answers) whose source zip must be
**byte-identical** to the baseline 089 captured from `main`; (2) the
pre-existing StepHost golden-walk parity test
([stepHost.goldenWalk.test.tsx](../../packages/studio/tests/steps/stepHost.goldenWalk.test.tsx),
spec 028/029 — a store-mutation-sequence oracle; a *different* artifact from
089's walk, and it must also stay green); (3) the affected package suites,
`tsc`, and the FR-003 lint layers. A story whose gate is not green does not
land; the spec's "may land as several PRs, one per user story" maps to one PR
per story phase in tasks.md, each PR's body recording its gate results.
Dependency risk, stated plainly: if 089's walk has not landed when 090's US1
starts, US1's first task is blocked — the walk is not re-invented inside 090.

## R8 — Carve per-item provenance: OPEN OWNER DECISION (not resolved here)

**Status: awaiting Matthew's ruling. Nothing in this plan locks a shape.**

The series has two provenance vocabularies in the code today:

1. **Record-level** `DecisionProvenance` — `"asked" | "extracted" | "default"`,
   plus `"derived"` declared by 088 FR-002 and first written by this spec.
   FR-006 extends this vocabulary to per-item provenance on collection
   values (`asked`, `derived`, `extracted`).
2. **Touch per-key agency** (spec 014) — each touch key carries
   `provenance: "base-derived" | "physical-suggested" | "hand-set"` (see
   [touchSuggest.ts:101-142](../../packages/studio/src/editors/touchSuggest/touchSuggest.ts)),
   and the decision log uses an agency object
   `{ agency: "hand-set" | "base-derived" | "physical-suggested" | "tool-proposed", source? }`.

US4 keeps vocabulary 2 for touch (the spec says so verbatim). One carve
sub-value is **out of this choice point's scope**: `carveDispositions` items
are `CarveDisposition` from `packages/contracts`
([carveDisposition.ts](../../packages/contracts/src/carveDisposition.ts),
spec 076) and already carry their own provenance vocabulary
(`closed-keyboard-card | closed-keyboard-card-declined | bulk-default |
author-override | deadkey-requirement`). They ride inside `carved-layout`'s
value unchanged — and 090 changes nothing in `packages/contracts`. The open
question covers only the **removal-set items** (`deletedNodeIds`,
`deletedItemIds`, `disabledFamilyIds`, `carveChars`), which today are bare
`Set<string>`s with no per-item provenance at all: how an item got there (a
hand `cascadeDelete`, a proposal via `prefillCarveDispositions`, a restore)
is not recorded. For those items, the candidates are:

- **Candidate A (the owner's floated candidate):** each removal item carries
  `{ provenance: "asked" | "derived" | "extracted" }` — vocabulary 1 per
  item. `asked` = a hand removal, `derived` = a proposal the author accepted
  (carve proposals are computed, and `prefillCarveDispositions` already
  distinguishes proposed from hand-set), `extracted` = an item read from the
  starting point.
- **Candidate B:** carve mirrors spec 014 exactly — per-item
  `{ agency: "hand-set" | "tool-proposed" | "base-derived", source? }`, one
  shape for every collection in the studio, at the cost of a second
  vocabulary inside decision values.

**How the plan handles the open decision:** the Foundational phase contains
an explicit **choice-point task** (T003) that presents both candidates with
the touch precedent and records Matthew's ruling into this file and
data-model.md. US3's `carved-layout` value type is written in data-model.md
against Candidate A and marked **PROPOSED — PENDING OWNER RULING**; US3 tasks
that depend on the shape carry a stop condition naming T003. Every other
story (US1, US2, US4, US5) is shape-independent and may proceed before the
ruling lands.

## Open questions

- **Q1 (owner, blocks US3's value shape only):** carve per-item provenance —
  Candidate A or Candidate B (R8)?
- **Q2 (owner, low stakes):** FR-001's renderer literal `"question"` vs the
  code's existing `"default"` — the plan renames to the spec's word (R3);
  confirm or drop the rename task.
- **Q3 (reconcile with 089's plan):** `help-docs` is settled by the `help`
  step, whose flow writes 089 moves into `apply`, while the step's component
  is the `PhaseFGate` gallery wrapper. The plan assigns 090 only the
  gallery-host registration and the US5 log entry for `help-docs`. If 089's
  plan instead expects 090 to own the whole help step, one task moves
  between the specs — flag at the 089/090 boundary review.
- **Q4 (plan-level, decided here, reversible):** FR-007 allows
  `surveyAnswerStore` to keep only within-step view position **or** be
  renamed to say so. The plan keeps the name and narrows the store (a rename
  churns every import in the studio for no behavioural gain); the narrowing
  is verified by SC-004-style greps for gallery answer ids. Revisit only if
  a reviewer finds the name actively misleading after narrowing.

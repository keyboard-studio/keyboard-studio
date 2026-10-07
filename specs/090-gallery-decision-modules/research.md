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
| touch_seed_source (`touch-seed-source`) | `TouchSeedSourcePanel` ([editors/touchSeedSource/TouchSeedSourcePanel.tsx](../../packages/studio/src/editors/touchSeedSource/TouchSeedSourcePanel.tsx)) | **Drifted since R1 was written (T010 re-verification, 2026-10-06):** 088 already deleted the session `touchSeedSource` field; the panel now records the decision directly (`useDecisionStore.record` in `handleConfirm`, with the R12/D-06 touch-draft clearing beside it). T012's remaining work is only the host/onChange wiring |
| characters (`character-inventory`) | `CharactersStep` + `PhaseB` | `phaseBDraftStore` (accept/decline, draft picks — see [phaseBDraftStore.ts](../../packages/studio/src/stores/phaseBDraftStore.ts)); `saveAnswer` for per-grapheme additions (CharactersStep.tsx:121-125); session sub-stage setters. **Re-verified T020 (2026-10-06):** row holds. The additions are the `characters.addition.<ch>` reproposal flags (spec 079): written by `confirmPrefill` (CharactersStep) and re-saved by PhaseB.tsx:943 when the author reconfirms a flagged addition; read by `deriveCharacterFlags` + `hooks/useWorkToDo.ts`. The draft store's full consumer set is larger than this row: CharacterMapPane (shell preview pane), PunctuationStep, InvisiblesStep, `phaseCInventory.ts`, `useGlyphFontStack` (font), `lib/draftPersistence.ts` (snapshot fold-in + two subscribe sites), `lib/crashCallerContext.ts` — see D-090-10 |
| marks (`marks-treatment`) | `MarksSeriesStep` | **Many** `saveAnswer` ids, not one: `marks_attachment.*`, `marks_treatment.class.*`, `marks_treatment.mark.*`, `marks_treatment.promoted`, `marks_treatment.input_order`, `marks_output_form.form`, `marks_stacking.*` (MarksSeriesStep.tsx:354-632, plus prefill writes :976-1032); reducer MARKS handler runs `applyMarkGuards` → `setWorkingIR` ([reducer.ts:358-382](../../packages/studio/src/steps/reducer.ts)); context tolerance is a station inside the series ([ContextToleranceStation.tsx](../../packages/studio/src/survey/marks/ContextToleranceStation.tsx)) whose patch goes through `CONTEXT_TOLERANCE_WRITES`. **Re-verified T020 (2026-10-06):** ids hold; prefill writes actually run :976-1057. Two mechanism drifts: (1) the reducer MARKS handler (now reducer.ts:345-371) consumes the completion **result payload** (`MarksCompleteResult.marksWorklist` / `marksOutputForm`), not the answers, and also sets `marksMigrationNeeded` via `detectBaseMarkMechanism`; the step reads its own answers back at :273 and builds the result's `answers` from them. (2) Context tolerance is **not** a reducer path: the decision rides the phase result (`marksContextTolerance` → `session.marksContextTolerance`) and a separate effect, `hooks/useContextToleranceApply.ts`, commits IR + `contextToleranceOverlay` through `applyMutatePatch` against `CONTEXT_TOLERANCE_WRITES` ([steps/contextToleranceWrites.ts](../../packages/studio/src/steps/contextToleranceWrites.ts), declared on the marks manifest entry) and stamps `appliedFingerprint` back onto the phase result. See D-090-11 |
| punctuation (`punctuation-inventory`) | `PunctuationStep` | `phaseBDraftStore`; one inventory `saveAnswer` (PunctuationStep.tsx:467). **Re-verified T020 (2026-10-06):** holds — the answer is `punctuation.inventory`, written only in `complete()`, value = the phase-C confirmed inventory; its load-bearing field is the spec 079 `evidenceKey` (FR-023 guard reads it back). The step's live edits are all draft-store ops (`add`/`addProposed`/`remove`/`seedProposals`/`acceptInvisible`) |
| invisibles (`invisibles-inventory`) | `InvisiblesStep` | `phaseBDraftStore` only: `acceptInvisible` / `declineInvisible` per notation; no `saveAnswer`. **Re-verified T020 (2026-10-06):** holds exactly (zero `saveAnswer` in the file) |
| convenience (`retained-convenience-chars`) | `ConvenienceCharsStep` | `saveAnswer("convenience", …)` (ConvenienceCharsStep.tsx:245); the retained set is also mirrored in `workingCopyStore.session.retainedConvenienceChars` (read by carve). **Re-verified T020 (2026-10-06):** the saveAnswer is per-candidate **boolean** answers keyed by candidate primary char (`saveKept`, :245), plus `setStatus` calls (step status — stays in the narrowed store, T026); the retained set is derived at `complete()` from candidates − unchecked. The session mirror is not a store field anyone writes directly: it is the field-wise `recordPhase` derivation over the phase-C result's `retainedConvenienceChars`; readers are CarveGalleryV2 (:745) and `survey/journey-runner.ts` (:708). See D-090-12 |
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
  the literal is unused at runtime. **RULED (owner ruling 2026-10-06, km-lead
  proposals Q5): the rename proceeds per FR-001; Q2 is resolved.** T004 keeps
  the rename — the keep-`"default"` alternative is rejected under the ruling.
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

## R8 — Carve per-item provenance: RULED — Candidate A (owner ruling 2026-10-06, km-lead proposals Q4)

**Status: RULED (owner ruling 2026-10-06, km-lead proposals Q4). Candidate A is the
shape: flat per-item `{ provenance: asked | derived | extracted }` for the removal-set
items; Candidate B is rejected.**

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
sub-value is **out of this ruling's scope**: `carveDispositions` items
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

**How the plan handles the decision:** the Foundational phase contained an
explicit **choice-point task** (T003) presenting both candidates with the
touch precedent. The owner ruled (owner ruling 2026-10-06, km-lead proposals
Q4): **Candidate A** — flat per-item `{ provenance: asked | derived | extracted }`
for the removal-set items; Candidate B is rejected. `carveDispositions` items
are out of this ruling's scope, as established above: their spec-076
provenance rides unchanged. US3's `carved-layout` value type in data-model.md
is marked **RULED**; T030/T032 proceed against Candidate A when their turn
comes — the stop gate that waited for this ruling is removed. T003 is
complete once the ruling is recorded here and in data-model.md.

## Open questions

- **Q1 — RESOLVED (owner ruling 2026-10-06, km-lead proposals Q4):** carve
  per-item provenance = Candidate A — flat per-item
  `{ provenance: asked | derived | extracted }` for the removal-set items (R8).
- **Q2 — RESOLVED (owner ruling 2026-10-06, km-lead proposals Q5):** FR-001's
  renderer literal — rename `"default"` → `"question"` (R3); T004 proceeds
  with the rename.
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

---

## Addendum — T001 predecessor audit (2026-10-06, implementation start)

State verified on `km/gallery-decision-modules` after the Step-0 restack
(merge `b71d7c9e` of `km/decision-apply` at its head `ad8e8231`, plus merge
`0d4c6dd7` of `km/modular-decisions` — the second merge was necessary because
089 had merged 088 only through phase 3, while 090's tasks presuppose 088
phases 4–6; both merges are pushed).

**Present and as planned:** 088's `decisionStore` at
`packages/studio/src/stores/decisionStore.ts` (`record` / `recordAll` /
`forget` / `reset`, snapshot helpers, contract C-1 import boundary intact);
the decision-keyed draft slice (draft v2 `decisions`); all fourteen gallery
`DecisionId`s and the exhaustive `decisionIRPaths` in
`decisions/decisionTypes.ts`; 089's apply contract types (`ApplyContext`,
`WorkingCopyPatch`) in `survey/types.ts`; 089's runner `applyDecisionEffects`
and `ApplyChannelError` in `steps/reducer.ts`; the golden-walk script
(`packages/studio/e2e/golden-walk.spec.ts`) and the StepHost parity harness
(`packages/studio/tests/steps/stepHost.goldenWalk.test.tsx`).

**Deltas recorded (reported to the lead; not silently adapted):**

- **D-090-1 — 089's `apply` is answer-typed.** `QuestionModule.apply` takes
  `string | string[] | undefined`, and `applyDecisionEffects` iterates
  step-completion *answers*. Gallery decision values are rich objects
  (data-model.md), so the T005 gallery host cannot feed them through
  `applyDecisionEffects` as-is. Resolution inside 090's own surface: gallery
  modules are typed `GalleryModule<V>` (090, foundational) whose `apply`
  takes `V | undefined`; the gallery host records the decision, builds the
  `ApplyContext`, and invokes the module's `apply` directly, reusing the
  runner's channel authorization (`ApplyChannelError`, contract A3) and the
  same injected patch sink StudioShell composes for the runner. The single
  cast to the answer-shaped `QuestionModule` lives at registry composition.
  If 089's in-flight US1 changes `ApplyContext`, the patch channels, or the
  module shape, this delta re-opens.
- **D-090-2 — overlay "applied view" writes are not expressible in
  `WorkingCopyPatch` (yet).** The A3 authorization table authorizes the
  overlay channels (`identity`, `attribution`, `helpDocs`,
  `historyEntryState`) only for their question decisions, and the patch type
  has no channel for working-copy overlay fields (carve deletions, touch
  draft). US1 is unaffected (its three applies are IR no-ops — the decisions
  themselves are the effect). US3/US4 applies that must write overlay fields
  resolve this at their story boundary: the gallery executor's sink is
  composed by the step wrapper from the working-copy store's setters,
  mirroring how StudioShell composes `applyWorkingCopyPatch`. Flagged for
  the lead; if 089 or 093 (overlay accumulator, cross-spec finding I-1)
  settles a channel first, 090 adopts it.
- **D-090-3 — golden-walk baseline capture is PENDING-BASELINE.** The script
  exists (089 T002), so T001's stop condition is not met; but 089's T003
  baseline capture is blocked in this environment (sandbox Chromium cannot
  reach localhost). Per the lead's coordination ruling, per-slice golden-walk
  gates in 090 run as StepHost parity + focused suites + tsc/lint, with the
  byte-identical golden-walk check reported PENDING-BASELINE — not passed,
  not fabricated.
- **D-090-4 — the contract suite treats `gallery/` as LIVE modules.** The
  shared suite (`test/questionModuleContract.ts`) globs
  `survey/questions/*/*.ts` eagerly; only the `reserve/` folder is demoted.
  Every gallery module file must therefore satisfy the full module contract:
  filename === `definition.id`, `inputs`/`writes` arrays present, at least
  one field-shaped fixture (stubs declare a single `undefined` valid fixture
  — no question-shaped answer exists), and a `definitionContract` snapshot
  line. No `index.ts` may live inside `gallery/` (it would be globbed as a
  module named `index`); the group list lives in `registry.ts`, mirroring
  `reserveOnlyModules`.
- **D-090-5 — 088 phase 4 already landed part of R1's touch-seed-source
  row.** The session `touchSeedSource` field and the panel's session write
  are already gone; `selectTouchSeedSource` reads the `touch-seed-source`
  decision. T012's remaining work is the host/onChange wiring, verified
  against the landed code at T010.
- **D-090-6 — spike `pb_character_inventory` is in no registry list.** It
  provides `character-inventory` but `decisionIndex` derives only from
  `questionRegistry`, so registering the gallery module in T008 does not
  trip the duplicate-provider guard. T021 (US2) still retires/folds the
  spike as planned.
- **D-090-7 — gallery renderers close an import cycle through the registry;
  `flowModules` extracted to a leaf (T012).** Registering store-coupled
  renderer components as gallery modules (T011/T012) put them in the
  registry's import graph, closing a cycle: registry → gallery module →
  renderer → `workingCopyStore` → `dashboard/completeness` → `steps/stepOrder`
  → `steps/stepDependencies` → registry. When the graph is entered
  registry-first (e.g. via `steps/reducer`), `stepDependencies` evaluated
  while the registry was still initializing and `flowModules` was
  unpopulated — a hard `TypeError` at module load. Fix, landed with T012:
  `flowModules` (and `demotedPhaseFModules`) moved verbatim from
  `survey/questions/registry.ts` into a new leaf
  `survey/questions/flowModules.ts` (question modules only); the registry
  imports and re-exports them, and `stepDependencies` imports the leaf.
  Additionally the A3 channel authorization moved from `steps/reducer.ts`
  to the leaf `steps/applyAuthorization.ts` (re-exported from reducer.ts)
  so the gallery host shares it without importing the registry-coupled
  runner. No behaviour change: stepOrder parity, manifest, questionModules
  (908 tests across the affected suites), and the runner's own suite are
  green. Every later gallery story (US2–US4 renderers all read stores)
  would have hit the same cycle.
- **D-090-3 label amendment (owner ruling 2026-10-06 22:41 CDT):** "Accept
  store-level gates; run live captures in CI." The per-slice golden-walk
  byte-identity check is a CI gate (e2e lane) rather than a pending
  baseline: slice reports record it as **CI-gated (golden-walk verify in
  the e2e lane)**, with the in-sandbox gate being StepHost parity +
  focused suites + tsc/lint as store-level evidence.
- **D-090-8 — decision value types live with their renderers (T016 gate
  fix).** The first three migrated modules each closed a type-only
  2-cycle (module imports renderer component; renderer imports the value
  type from the module), which depcruise's `no-circular` counts — the
  repo total rose 122 → 124 at the US1 gate. Fix: each value type is
  declared in its renderer file and re-exported by the module
  (`WindowsLayoutValue` in survey/layout/LayoutStep.tsx,
  `BaseKeyboardValue` in survey/chooseBase/BaseKeyboardRenderer.tsx);
  for touch-seed-source the panel now imports 088's canonical
  `TouchSeedSourceValue` from stores/decisionStore.ts (the module keeps
  its own identical union — gallery modules may not import stores).
  Later stories follow the same pattern: value types live with the
  renderer, modules re-export. Repo total after the fix: 121 (one below
  the pre-090 base — the touch panel's move also dissolved a
  pre-existing cycle).
- **D-090-9 — StepHost golden-walk fixtures regenerated for the US1
  migration signature (lead adjudication, confirmed intended).** After
  US1 (T011 windows-layout, T012 touch-seed-source, T013 base-keyboard),
  the spec 028/029 StepHost oracle fixtures
  (`tests/steps/__fixtures__/goldenWalk/{copy,adapt}.json`) no longer
  matched the recorded walk. The implementer stopped the regeneration
  rather than absorbing an unexamined delta; the lead adjudicated the
  full delta as T013/US1's intended migration signature and confirmed:
  - `decisionMutations: []` → `["record"]` at `layout`, `choose_base`,
    and `touch_seed_source` in both tracks — the three migrated steps
    now record decisions through the gallery host (expected: this is
    the migration itself).
  - `choose_base` `storeMutations` loses **both** `setBaseConfirmed`
    calls. Evidence this is intended, not a lost behaviour: on this
    branch no production code reads `baseConfirmed` as a trigger —
    StudioShell arms off the recorded `base-keyboard` decision
    (StudioShell.tsx:1082 comment + code); `BaseKeyboardRenderer`
    records via the host; both `setBaseConfirmed` production callers
    were deleted in c6902ee9 (T013); the flag and setter survive in
    surveySessionStore only as persisted draft shape + reset paths.
    The preview-commit gating tests were re-pointed to the decision
    trigger in US1 and pass.
  Fixtures were regenerated via the harness write path
  (`loadOrWriteFixture`: absent fixture → write) and the regenerated
  diff was verified entry-by-entry to contain **nothing beyond those
  two delta shapes** in either track before committing. This oracle is
  spec 028/029's StepHost mutation-sequence fixture — distinct from
  spec 089's golden-walk zip baseline, which is untouched by this
  regeneration.
- **D-090-10 — the Phase B/C accumulator pattern (T020 design, US2).**
  T020's re-verification (R1 rows above) shows the Phase B draft is not
  a per-step store: one accumulator is edited from four step trees
  (characters, punctuation, invisibles, and CharacterMapPane — a
  StudioShell preview-pane component outside every step tree) and read
  by `phaseCInventory`, `invisiblesFlags`, `useWorkToDo`,
  `useGlyphFontStack`, `crashCallerContext`, and draft persistence.
  US2 therefore migrates it as follows. (a) The store's pure logic
  (pick derivation, provenance-strengthening adds, seed contracts)
  moves verbatim-in-behaviour to pure functions over the decision
  values in `survey/phaseBDraftOps.ts`. (b) A shared hook,
  `survey/useInventoryDraft.ts`, subscribes to the `character-inventory`
  and `invisibles-inventory` records in `decisionStore` and exposes the
  field/op surface the components use today; each op computes the next
  value purely and records it through `decideGalleryValue` — the
  gallery host's own exported decide core (steps/galleryHost.tsx) with
  `buildGalleryHostDeps()` — under the editing step's attribution.
  This is the host write path, not a store write: FR-003's audit bans
  store write actions, and none is called. Each step is additionally
  hosted via `GalleryHost` for its own module, and its own-value edits
  go through the renderer's `onChange` exactly as in US1. (c) Field
  mapping, `PhaseBDraftState` → values (T021's field-for-field task):
  `CharacterInventoryValue` keeps the foundational derived split
  (`chars`, `bases`, `marks`, `attestedStacks`, `declaredRoles`,
  `numbers`, `punctuation`, `symbols`, `separators`, `controls`,
  `provenance`) and gains the draft meta that must survive reload and
  re-entry: `exemplarDigraphs`, `loanwordChars`, `rejected`,
  `proposalConfidence`, `exemplarMethodDeclined`, `seededProposals`,
  `alphabetEvidenceKey`, `selectedFont`. Excluded: `lastPick`
  (transient highlight — renderer-internal, research R3) and
  `invisibleDecisions` (→ the invisibles value). (d) Inventory item
  provenance (FR-006) maps from draft provenance at the op that
  records it: `author → asked`, `base → extracted`, `text → extracted`,
  `cldr | sldr | ascii-floor → derived` — mirroring the ruled carve
  semantics (extracted = read from the starting point, derived = a
  computed proposal, asked = a hand decision). The punctuation value
  is maintained by the draft hook as a projection of the draft's
  punctuation slice + the rejected-punctuation ledger (provenance
  captured at removal time, before the draft forgets it), recorded
  when a punctuation record exists or the editing step is
  `punctuation`. The invisibles value is written by the explicit
  accept/decline ops (adopt-controls carry-over items are `derived`).
  (e) A saved v2 draft's `phaseBDraft` slice (T025) maps onto these
  values field-for-field by the same table; entries that cannot map
  are surfaced as decision-trail orphans (088's T030 mechanism, 087 Q5
  precedent), never dropped.
- **D-090-11 — marks `apply` fires on the completion payload (T023).**
  Today `applyMarkGuards` runs once, at step completion, from the
  result payload — never per answer. Recording answers live (the plan's
  rule: onChange at the same commit points as today's writes) must not
  move the guards earlier: a partial series would guard a partial
  worklist, and re-guarding is not proven idempotent. So
  `MarksTreatmentValue` carries `answers` (the composite, recorded on
  every answer edit, `completion: null`) plus, set by the renderer's
  completion report, `completion: { worklist, outputForm }`; `apply`
  returns `{}` while `completion` is null and performs the guards (and
  the `marksMigrationNeeded` determination) from the payload when it
  is set — the same commit point as today's reducer MARKS handler,
  which T023 retires. An answer edit after completion clears
  `completion` in the same report, so a stale payload can never
  re-apply. The context-tolerance half keeps its existing effect
  shape (it needs the live analysis + overlay state, which a pure
  `apply(value, ctx)` cannot await): `useContextToleranceApply`
  re-keys its decision source from `session.marksContextTolerance`
  (a phase-result field) to the `marks-treatment` decision value's
  `contextTolerance` (the full contracts decision shape — the
  foundational stub's `contextToleranceOutcome: string | null` is
  widened in T023, as the stub anticipated), and its
  `appliedFingerprint` bookkeeping re-records the decision instead of
  mutating a phase result. The patch itself still commits through
  `applyMutatePatch` against `CONTEXT_TOLERANCE_WRITES`, unchanged.
- **D-090-12 — the convenience mirror is a value-sourced result
  (T024).** `WorkingCopyPatch` (089 contract A3) has no session
  channel, and the A3 table authorizes channels per decision — adding
  one amends 089's contract, outside 090's mandate (the D-090-2
  wrapper-sink route cannot carry the value either: the sink signature
  is `(patch, writes)`). T024 therefore makes the mirror an applied
  view in the sense data-model.md allows ("an applied view **or a
  selector over this value**"): toggles record
  `RetainedConvenienceCharsValue` live through `onChange` (the
  per-candidate boolean answers leave `surveyAnswerStore`); the step's
  completion result — whose `retainedConvenienceChars` field is what
  `recordPhase` derives `session.retainedConvenienceChars` from — is
  computed **from the recorded value**, not from answer-store
  booleans. Carve's read is unchanged, per the task. The answer-store
  record that disappears is the second record; the session field
  remains a derivation, now of the decision.

- **D-090-13 — T021 implementation deltas (recorded at the T021
  checkpoint, 2026-10-07).** Five findings while landing the
  character-inventory module, none blocking, two structural:
  (a) **The draft accumulator pattern (D-090-10) shipped as designed:**
  pure ops in `survey/phaseBDraftOps.ts` (the old store logic ported
  behaviour-verbatim, including the pick reconstruction from
  `chars`+`declaredRoles` the snapshot-restore path relied on), the
  shared hook in `survey/useInventoryDraft.ts` recording through
  `decideGalleryValue` under the editing step's attribution, and — as an
  **interim bridge only** — `stores/phaseBDraftStore.ts` became a
  zustand facade over the decision records so the not-yet-migrated
  consumers (Phase C steps, hooks, draft persistence) keep compiling
  against the old interface. The facade and the store file are deleted
  in T025; `lastPick` moved to a local UI store in the hook module
  (renderer-internal transient, per D-090-10(c)).
  (b) **Module↔renderer cycle, third form (extends D-090-7/D-090-8):**
  the registry now imports CharactersStep (the module's renderer),
  whose static PhaseB import closes
  registry → characterInventory → CharactersStep → PhaseB → flowSources
  → registry; registry-first entries (the decisions suites) crashed at
  module evaluation (`flowModules` mid-evaluation). CharactersStep
  therefore imports Prefill/PhaseB by file (not the survey barrel —
  the barrel closes the same cycle through IdentityLite) and loads
  PhaseB **lazily** (`React.lazy` + Suspense), keeping it out of the
  static module graph. Depcruise still counts the dynamic edge:
  static cycles 121 → 127, of which 4 are the transient facade family
  (die at T025) and 2 are this module graph (the PhaseB edge is
  dynamic at runtime; the Prefill variant runs over a type-only
  import). Downstream harness consequence: every suite that mocks
  `survey/index.ts` with `studioShellMocks/surveyIndex` now also
  registers the same stubs for `survey/Prefill.tsx` /
  `survey/PhaseB.tsx`, and two tests await the lazy mount
  (`findByTestId`) where they previously asserted synchronously.
  (c) **Module `requires` are the step's declared requires** (the
  FR-002 coverage parity pins them EQUAL — the foundational stub was
  right, the spike's empty set was the anomaly). Corollary:
  `runDecisionFlow` orders by requires and throws on unprovided ones,
  so subset flows that include the module must include the requires
  closure (track_choice, project_keyboard_id, project_display_name):
  `extractContext.test.ts`, `successCriteria.test.ts` (closure kept
  OUT of SC-001's measured set — the rate still measures the same six
  decisions), and `sc004Harness.ts` ADAPT_MODULES were extended
  accordingly.
  (d) **Draft restore order changed** (`lib/draftPersistence.ts`):
  the decision snapshot now restores BEFORE the phase-B slice, and
  the slice restore is skipped when the envelope's decisions already
  carry the inventory records (the slice was folded from them at save
  time; the old order let the decision restore clobber the FR-032
  pre-079 stamp, which is now itself a decision record). Pre-090
  envelopes — slice only — restore exactly as before (draftPersistence
  suite 112/112).
  (e) **StepHost golden-walk delta for T021** (both tracks, sole
  delta): at `characters/prefill`, `decisionMutations: [] →
  ["record", "record"]` — confirmPrefill's draft reset and
  evidence-key stamp are now two character-inventory records.
  Fixture regeneration is deferred to the US2 story gate (T029)
  with the rest of US2's signature, per the US1 pattern.
  Also noted, not T021 fallout: the two `touch_seed_source`
  renderSmoke failures reproduce identically at the pre-T021 HEAD
  (b7bcbbc4) — predecessor-surface state (089 watch item), untouched
  here.

- **D-090-14 — T022 landed as designed (2026-10-07).** The
  punctuation/invisibles modules are real (renderers hosted via
  PunctuationStepHost/InvisiblesStepHost); both steps read and edit
  through `useInventoryDraft` under their own attribution — the
  punctuation value stays the D-090-10(d) projection, maintained by the
  hook. No new static cycles (127 → 127: neither step's graph reaches
  flowSources/the registry, so no lazy edge was needed here — the
  T021 cycle was PhaseB-specific). Golden-walk delta UNCHANGED from
  T021 (the walk's punctuation/invisibles hops record nothing new:
  exemplar seeding never settles in the harness and the invisibles
  carry-over is a no-op on an empty controls bucket). One op-level
  refinement: `withInvisibleDecision` now returns the value unchanged
  when the item already carries that decision — the old store absorbed
  redundant toggles silently; as decision records they would have
  minted duplicate versions of the same value. Harness fallout, for
  the record: `tests/steps/makeFlowStepComponent.test.tsx`'s partial
  store mocks grew `getDecisionSnapshot` + `subscribe` +
  working-copy `getState` — the global test setup auto-resets the
  draft facade, whose reset now flows through the gallery host deps.
  That file also carries 2 PRE-EXISTING eslint errors (unused
  `beforeEach`/`EditorStepProps` imports, present at the pre-T022
  HEAD) — left untouched as out-of-scope.

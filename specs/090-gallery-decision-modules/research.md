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
| mechanisms (`physical-layout`) | `MechanismGallery` ([editors/assignLoop/MechanismGallery.tsx](../../packages/studio/src/editors/assignLoop/MechanismGallery.tsx)) | `recordAssignments` on `workingCopyStore` (:1568, 2646) into `phaseResults`; reducer R1 `lockDesktop()` on completion ([reducer.ts:384-386](../../packages/studio/src/steps/reducer.ts)); `repropagate` refreshes suggested assignments. **Re-verified T040 (2026-10-07):** the row holds; only line drift. `recordAssignments` (store type :1046, impl :2092) still writes `MechanismAssignment[]` into the phase-C `phaseResults` entry; the gallery selector is still :1568, call sites now :2646, :3070, :3163, :3189, :3258. R1 now sits at reducer.ts:316-318 and fires `deps.lockDesktop()` plus the staleness-gated `repropagate` in the same case; `lockDesktop()` itself is a bare `set({ desktopLocked: true })` — a store flag, no snapshot. `repropagate` (steps/repropagate.ts) is the spec-014 no-clobber TOUCH re-propagation triggered by physical completion (suggested touch keys refresh; hand-set survive), not a mechanisms-internal refresh. The step is registered via `AddPhysicalAdapter` (registerEditorSteps.ts:210), which completes with `undefined`; journey-runner replays the step by calling `applyStepCompletion("mechanisms", undefined, deps)` directly (journey-runner.ts:766-770). See D-090-38 |
| touch_seed_source (`touch-seed-source`) | `TouchSeedSourcePanel` ([editors/touchSeedSource/TouchSeedSourcePanel.tsx:359](../../packages/studio/src/editors/touchSeedSource/TouchSeedSourcePanel.tsx)) | `setTouchSeedSource` on `surveySessionStore` (after 088 this session field is deleted — the panel's write becomes a decision record; see R6 note) |
| touch (`touch-layout`) | `TouchGallery` ([editors/assignLoop/TouchGallery.tsx](../../packages/studio/src/editors/assignLoop/TouchGallery.tsx)) | `setTouchDraft` (:1917, 4115), `deleteTouchKey` (:1781); overlay `keyEditOverlay.ops`, `deletedTouchKeyIds`, `touchDraft`; reducer R2 `setTouchLayoutJson` on completion. **Re-verified T040 (2026-10-07):** the row holds; only line drift (`setTouchDraft` selector :1918, call :4116; `deleteTouchKey` selector :1782; store defs :1066 / :898). The overlay types are engine types (`KeyEditOverlay` / `KeyEditOperation` from `@keyboard-studio/engine`); `deletedTouchKeyIds` (store :602) and `touchDraft` (:733) sit on `workingCopyStore`. R2 now sits at reducer.ts:339-390 and consumes a `TouchCompleteResult` assembled by `AddTouchAdapter` (assignments + baseIr + baseVfs + mods + seedSource; mods computed adapter-side via `deriveDesktopModifications`). **Mechanism correction to the row's implication:** `buildTouchLayoutJson` does NOT consume the key-edit ops — its inputs are baseIr + `TouchAssignment[]` + {baseTouchJson, mods, seedSource}, with the spec-035 R11 emission matrix inside the injected dep; the ops replay onto the gallery's derived layout, never into the R2 build. Journey-runner assembles its own payload (assignments: []) and calls `applyStepCompletion` directly (journey-runner.ts:795-803). See D-090-38 |
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

- **D-090-15 — spec 089 merged (km/decision-apply @ 03d1a1ef, lead
  update 2026-10-07).** Merge taken at the T022 checkpoint. What it
  changed on this branch: (a) the mutate seam is gone (mutateFlag.ts,
  QuestionModule.mutate/MutateContext deleted) — no US2 code assumed
  either; the inventory modules are pure descriptors and the facade/
  hook record through the host's decide core, so nothing here needed
  adaptation. (b) Identity/context reads are decision-derived
  everywhere (089 FR-005/T017: `identityResult`/`surveyContext` no
  longer exist on surveySessionStore; `deriveIdentityResult` /
  `deriveSurveyContext` / `deriveIdentityResume` in
  decisions/identitySelectors.ts are the reads). Conflict resolutions
  all took the same shape — 090's decision-value surface + 089's
  decision-derived reads: CharactersStep, CharacterMapPane,
  InvisiblesStep(+test), LayoutStep (US1 renderer kept; only its
  bcp47 source adopted the derivation, as did LayoutStepHost),
  panelAdapters(+test: 089's writes-nothing IdentityLiteAdapter and
  seedIdentityDecisions setup + T013's decision-recording
  assertions), makeFlowStepComponent mocks (self-contained union:
  089's seeded identity decisions + 090's snapshot/subscribe/getState
  surface). (c) draftPersistence: BOTH branches had independently
  moved `applyDecisionSnapshot` before the phase-B restore (089 for
  the stamp's decision-derived identity, 090 T021 for the inventory
  clobber); the merge keeps one restore, 090's decisions-carry-
  inventory guard, and one stamp. (d) Golden walk: the merged harness
  (unified spy installation feeding both lists) walked against the
  committed fixtures produces deltas of EXACTLY two shapes, verified
  entry-by-entry in both tracks — interleaved "record" entries in
  storeMutations at layout/choose_base/touch_seed_source (the second
  list the unified spies feed, absent from the pre-merge fixture
  which descended from a single-list regeneration) and the T021
  signature at characters/prefill (decisionMutations [record, record]
  + the same two records interleaved). Nothing else differs; step
  sets identical (16/15). Fixture regeneration remains the T029
  story-gate action. One harness repair was needed post-merge:
  driveSteps now awaits each click target (findByTestId) — the copy
  track's first lazy PhaseB load no longer resolves inside a
  synchronous getBy (the adapt track, running second on a warm module
  cache, masked it); recorder windows are unchanged. (e) Depcruise:
  127 → 131, exactly 089's +4 type-only decisions/ cycle paths; the
  4 transient facade cycles remain (die at T025). The two
  touch_seed_source renderSmoke failures persist post-merge (they
  were pre-existing on BOTH branches' bases). Full studio suite run
  as the merge gate: see the merge commit / story report for the
  tally (focused merge-seam battery: 292/292 + tsc clean at commit
  time).

- **D-090-16 — T023 marks-treatment landed (implements D-090-11).**
  `marksTreatment.ts` is a real module: renderer `MarksSeriesStep`
  (converted to `DecisionRendererProps<MarksTreatmentValue>`, hosted by
  new `survey/marks/MarksStepHost.tsx`), `writes: [groups, stores]`,
  `apply` runs `applyMarkGuards` from the value's completion payload
  only (no-op while `completion` is null, when the IR is null, and
  when the guarded IR is unchanged). The value types + record surface
  live in new `survey/marks/marksValue.ts` (D-090-8 leaf: the module
  imports the renderer, the renderer and the tolerance hook import the
  helpers). Refinements to D-090-11's letter, all forced by the
  contracts: (1) `completion` carries a third field, `migrationNeeded`:
  the R10 determination must be computed from the PRE-guard IR at the
  completion report (the reducer's exact input — `detectBaseMarkMechanism`
  scans rule outputs, and the guards add rules, so a post-apply read
  is not provably the same), and apply has no session channel; the
  renderer computes it, `MarksStepHost` mirrors it into
  `session.marksMigrationNeeded` with the reducer's only-ever-true
  semantics. The flag has no in-app reader (verified by grep); it is
  persisted draft shape. (2) The value's `answers` composite is
  recorded at the step's existing decision-record commit points (each
  station's Next via `recordValue`, and completion) — NOT per toggle:
  marks answers carry spec 079's draft→confirmed evidence lifecycle,
  and the per-toggle writes remain the answer-store evidence layer
  (T026 adjudicates its fate, as with characters' addition flags).
  The composite is the full derived `answersForStation` set in record
  form, so an intermediate record after a completed pass is what
  clears `completion` (D-090-11's stale-payload rule). (3) The value's
  `contextTolerance` mirrors the session merge's last-wins semantics:
  a completion reporting no tolerance decision PRESERVES the value's
  existing decision (`effectiveTolerance = resolved ?? prior`), never
  clears it — clearing would make the re-keyed apply hook remove a
  fix the session still considers decided. The prior is read
  value-first with the session derivation as fallback (drafts restored
  from before the value existed); intermediate records adopt the
  effective prior into the value. (4) `answers` values include
  booleans (attachment/stacking answers) — the stub's
  `string | string[]` widened accordingly.
  `useContextToleranceApply` re-keyed per D-090-11: decision source is
  the value's `contextTolerance`; `markApplied` re-records the value
  with `appliedFingerprint` through the stub decide path (no-op
  apply — stamping must not re-run the guards); the patch still
  commits via `applyMutatePatch` vs `CONTEXT_TOLERANCE_WRITES`.
  Reducer: MARKS case, `MARKS_STEP_ID`, `MarksCompleteResult` and the
  `setMarksMigrationNeeded` dep retired (StudioShell wiring removed);
  `decisionIRPaths["marks-treatment"] = [["groups"],["stores"]]` and
  the id left `IR_LESS_DECISIONS` (the consistency test's own
  instruction). One new depcruise cycle appeared (registry → module →
  renderer → decisions/contextToleranceProposal → recordSurveyAnswers
  → decisionLogStore → registry) and was broken by leaf extraction:
  the three tolerance question-id constants moved to new
  `decisions/contextToleranceIds.ts` (re-exported from
  contextToleranceProposal.ts); depcruise back to the post-merge
  baseline 131. Tests: reducer marks block deleted, its assertions
  ported to new `survey/questions/gallery/marksTreatment.test.tsx`
  (contract, apply guards/no-ops/idempotence, host flag mirror);
  marks suites + useWorkToDo.marksParity re-pointed to MarksStepHost;
  the tolerance hook's suite re-seeds via the decision record. Gates:
  tsc clean; eslint 0 errors; focused batteries green (marks family +
  module + hook + reducer 161; decisions 1129 passed with ONLY the 4
  known pre-existing local-corpus SC-004 failures; src/steps 407/407;
  StudioShell + previewCommitGating + MechanismGallery.progression +
  deepLinkRevision green; parity trio green unmodified). Golden walk:
  fresh-walk classification vs committed fixtures shows ONLY the
  already-reported post-merge signature (D-090-15(d)) — zero marks
  delta (both walk alphabets are marks-free; the marks step records
  no entry in either walk). Regeneration remains T029's action. The
  2 touch_seed_source renderSmoke failures persist (pre-existing).

- **D-090-17 — T024 retained-convenience-chars landed (implements
  D-090-12; the tasks text's "applied view written by apply" is NOT
  followed — D-090-12 ruled it outside 089's contract, flagged at the
  T022/T023 checkpoints).** The module is real (renderer
  `ConvenienceCharsStep` converted to `DecisionRendererProps`, new
  `ConvenienceStepHost`, manifest swapped; `apply: () => ({})`,
  `writes: []` — decisionIRPaths unchanged). Toggles record the value
  live through onChange; the per-candidate boolean answers LEAVE
  `surveyAnswerStore` (the step's `setStatus` calls stay — step status
  is not a gallery answer). The completion result's
  `retainedConvenienceChars` is computed from the recorded value:
  `complete()` reconciles the record to the current candidate set
  (record-if-changed) and builds the result from that same set, so
  `recordPhase`'s session derivation and carve's read are unchanged.
  Three design points the stub did not pin down: (1) **the value
  carries `rejected: string[]`** alongside `retained` — the answer
  booleans encoded a tri-state (saved-false = rejected; no record =
  propose-then-confirm default), and a retained-only value would
  silently un-keep any candidate that became surplus after the record
  (the shape-change case, pinned by ConvenienceCharsStep.test's
  spec-079 T048/T079 suite). A candidate in neither list is kept by
  default. Same solution as the character inventory's `rejected`
  field (T021). (2) **Per-item provenance (FR-006):** a candidate the
  author acted on (toggle, keep-all, keep-none) records its chars as
  `asked`; untouched candidates keep their recorded provenance or,
  on a first record (including the completion reconciliation), the
  proposal's `extracted`. (3) **Pre-T024 draft migration is a
  step-level adoption shim:** restore cannot rebuild the value (the
  candidate set is a live gate computation, unknown at restore time),
  so the step, on its first settled `applies` render with no recorded
  value but legacy answer-store booleans present, adopts them into
  the value once (provenance `extracted`). T026 must keep the
  convenience answers readable for this shim or retire it with the
  slot. The not-applicable path records NO value (absent =
  never-asked, mirroring the result's absent field — a `{retained: []}`
  record would falsely read as "asked, kept nothing"); the `unknown`
  path completes through `complete()` and records `{retained: []}`.
  The manifest `persistence: "answer-store"` declaration is unchanged:
  the step's status slot (not-asked/finished + evidence key) remains
  answer-store state; T026 adjudicates the declaration. Value types
  live in new `survey/convenience/convenienceValue.ts` (D-090-8 leaf),
  re-exported by the module. Gates: tsc clean; eslint 0 errors (one
  pre-existing lingui warning on untouched code); depcruise 131
  (baseline holds, no new cycle); convenience battery 424/424 (incl.
  the shape-change and unmount-persistence suites, coverage +
  consistency); src/steps + useWorkToDo + carve 457/457;
  surveyWriteObservability 57/57; StudioShell + draftPersistence
  green. Golden walk: fresh-walk classification is byte-identical to
  the T023 classification (the 7 known post-merge-signature deltas
  per track) — T024 adds zero delta (convenience is not a walk step).
  The 2 goldenWalk + 2 renderSmoke failures are the known pending
  T029 regeneration and pre-existing items respectively.

- **D-090-18 — T025 phaseBDraftStore deleted; the draft slice is gone
  from the written envelope; legacy slices migrate into the inventory
  decision values on load.** `stores/phaseBDraftStore.ts` is deleted
  and grep for `phaseBDraftStore` is 0 across src and tests (the
  T027/SC-004 condition, reached here). The real production consumers
  were few and are re-pointed at the decision values:
  `hooks/useWorkToDo.ts` (alphabetEvidenceKey — a `useDecisionStore`
  selector + `getCharacterInventoryValue()`), `lib/crashCallerContext.ts`
  (chars length), `survey/phaseCInventory.ts` (invisibleDecisions via
  `invisibleDecisionsOf(getInvisiblesInventoryValue())`),
  `survey/useGlyphFontStack.ts` (selectedFont via a decision-store
  selector), `src/test/draftSeeds.ts` (`resetInventoryDraft()`).
  `stores/workingCopyStore.ts` keeps a module-private leaf named
  `resetPhaseBDraftDecisions` over `useDecisionStore` +
  phaseBDraftOps only: workingCopyStore sits UNDER the gallery host
  deps in the import graph, so importing the inventory hook would
  close the old facade cycle in a new shape; behaviour parity holds
  because both modules' applies are no-ops and `resetDraftDecisions`
  never touches `chars`. `useInventoryDraft.ts` gains the public
  surface the facade's callers used: `resetInventoryDecisions()`,
  `resetInventoryDraft()`, `restoreInventoryFromSnapshot(snapshot)`.
  **Envelope:** `DurableDraft.phaseBDraft` and the `buildEnvelope`
  write are removed (no DRAFT_VERSION bump — the field was always
  optional/additive). `loadDraft`, after `applyDecisionSnapshot`, runs
  the slice migration ONLY when the envelope's decisions carry no
  inventory records (when they do, the slice is a stale duplicate of
  the canonical records and is ignored). `parsePhaseBDraftSlice` keeps
  the old tolerant field-by-field semantics, but every unmappable
  entry (non-string array members, invalid declaredRoles /
  invisibleDecisions values, non-string provenance / confidence /
  alphabetEvidenceKey, invalid selectedFont, unknown slice keys,
  non-array / non-record field values) is collected as a
  `MigrationOrphan` with questionId `phaseBDraft.<field>` (record-entry
  drops: `phaseBDraft.<field>.<key>`), stepId `characters` — surfaced,
  never dropped (087 Q5 / 088 T030 precedent). **Ordering catch, found
  by the new tests:** the orphans must be appended AFTER the
  decisionRecord restore, whose `hydrate` replaces the log — the first
  implementation appended inside the migration and the hydrate erased
  them; `migratePhaseBDraftSlice` now RETURNS its orphans and loadDraft
  appends them together with the envelope's own migrationOrphans, the
  position 088 already used for the same reason. **Autosave:** both
  facade subscriptions (autosave installer, cloud sync) moved to
  `useDecisionStore.subscribe` with an identical trigger set — the
  facade only ever changed when decisions changed, and every decision
  change already scheduled a save through it. **Manifest:** the
  `persistence: "phase-b-draft"` declarations on characters /
  punctuation / invisibles are KEPT. They are pinned by
  `manifest.persistence.test.ts` against the spec-079 persistence
  table (the kind union is spec-079 vocabulary in `steps/types.ts`);
  renaming the kind amends that table, which is T026's persistence
  adjudication alongside marks/convenience (T024 precedent,
  D-090-17). **Tests:** the sweep re-pointed 20 files mechanically
  (ops via `inventoryOps("characters")`, reads via
  `getCharacterInventoryValue()` / `invisibleDecisionsOf(...)`,
  snapshot via `snapshotFromValues(...)`); the 946-line store suite is
  RENAMED `stores/phaseBDraftStore.test.ts` →
  `survey/phaseBDraftOps.test.ts` with a `draft()` adapter (the old
  getState() shape over the values + ops) — this discharges most of
  T028's formal re-point early; T028 should verify what remains.
  draftPersistence's legacy-field tests are rewritten as migration
  tests (hand-built slice + inventory stripped from decisions), two of
  them asserting the orphan lands in the decision log
  (`phaseBDraft.selectedFont`, `phaseBDraft.alphabetEvidenceKey`). The
  phaseCInventory malformed-key test changes its malformed classes:
  the value carries ITEMS and keys are derived via `toUPlusNotation`,
  so stored-key garbage cannot exist; the carry-able malformed entries
  are a lone surrogate (U+DFFF) and a noncharacter (U+FDD0), both
  rejected by `parseUPlusNotation` — asserted ignored. Gates: tsc
  clean; eslint 0 errors on changed files; focused suites green
  (draftPersistence + phaseCInventory 118/118; the re-point batch
  incl. workingCopyStore / phaseBDraftOps / surveyWriteObservability /
  punctuation / invisibles / convenience green; StudioShell family
  66 + 71; PhaseB / CharacterMapPane / BuildListView / marks
  textSample 127/127; useWorkToDo 4/4); parity trio green UNMODIFIED;
  decisions 974 passed with ONLY the 4 known pre-existing local-corpus
  SC-004 failures (basic_kbdru + arabic_izza, both sc004 suites);
  depcruise 131 → **127** (exactly the 4 facade-family cycles dying;
  the remaining count still carries the 089-side shared cycle —
  registry → … → survey/types → workingCopyStore → completeness —
  whose fix `030bf59c` on km/decision-apply arrives with the next
  merge; post-merge number reported at that checkpoint). Golden walk:
  fresh-walk classification byte-identical to T023/T024 (the 7 known
  post-merge-signature deltas per track) — T025 adds zero delta;
  fixtures restored (regeneration remains T029's action).

- **D-090-19 — T026 persistence adjudication: the options, re-derived
  and recorded for the lead's ruling (T026 STOPPED here — no option
  is chosen by this entry).** Provenance note: the predecessor's
  report referenced lettered options (a)/(b)/(c) that were not in the
  delivered text; the option space below is re-derived from the
  branch evidence (D-090-17, D-090-18, D-090-16, the spec-079
  persistence table, `steps/types.ts`, `manifest.persistence.test.ts`)
  and recorded in full so the ruling is made on text, not on a
  summary of text.

  **The facts the adjudication turns on.** (1) The five US2 steps'
  decided values now live in `decisionStore`, persisted in the v2
  draft's `decisions` slice (088 FR-007): character-inventory (T021),
  punctuation- + invisibles-inventory (T022), marks-treatment (T023),
  retained-convenience-chars (T024). (2) The manifest declarations
  have not moved: characters / punctuation / invisibles still
  declare `persistence: "phase-b-draft"` (manifest.ts:100/189/213) —
  a store T025 deleted; marks and convenience declare
  `"answer-store"` (manifest.ts:163/238 in the pre-merge numbering).
  (3) The declarations are machine-pinned:
  `manifest.persistence.test.ts` parses
  `specs/079-survey-answer-persistence/contracts/step-classification.md`
  and fails unless each row's FIRST backtick token equals the
  manifest's declaration for that step (dual declarations are
  expressible — the characters row already reads `` `phase-b-draft`
  (alphabet) + `answer-store` (sub-screen position, …) `` and only
  the first token is compared). The kind union itself is spec-079
  vocabulary (`steps/types.ts`, R-02/R-12):
  `"answer-store" | "phase-b-draft" | "working-copy" | { exempt }`.
  There is no decision kind. (4) The answer store is NOT yet free of
  gallery answers, so T026's premise ("zero gallery answer ids
  remain") is not currently true: marks' per-toggle answers remain
  in `surveyAnswerStore` BY DESIGN (D-090-16(2) — they carry spec
  079's draft→confirmed evidence lifecycle; the value records the
  derived composite at commit points, and per-toggle recording was
  rejected in D-090-11 because re-guarding a partial series is not
  proven idempotent; D-090-16 names T026 as the adjudicator of this
  layer's fate); characters' per-grapheme addition answers remain
  (CharactersStep.tsx:147, the manifest comment's "manual-path
  answers"); punctuation still writes its one inventory answer
  (PunctuationStep.tsx:481); convenience's booleans LEFT the store
  (D-090-17) but its pre-T024 adoption shim reads legacy booleans
  restored from older drafts' `surveyAnswers` slices — D-090-17:
  "T026 must keep the convenience answers readable for this shim or
  retire it with the slot"; marks and convenience also keep their
  step-status slots (not-asked/finished + evidence key) in the store
  (D-090-17's stated basis for convenience's unchanged declaration).
  (5) `surveyAnswerStore`'s own header already frames the narrowed
  role T026's text asks for ("what was GIVEN, including drafts" vs
  the decision record's "what was DECIDED") — the narrowing is a
  declaration problem more than a store problem.

  **Option (a) — declare the decisions slice (extend the spec-079
  vocabulary).** Add `"decision-store"` to `PersistenceDeclaration`
  in `steps/types.ts`; re-declare the five steps with the decisions
  slice as the first token — characters keeps its dual form
  (`` `decision-store` (alphabet) + `answer-store` (sub-screen
  position, manual-path answers) ``), marks/convenience declare
  `decision-store` with the answer-store evidence/status residue
  named in the manifest comment (the pin compares only the first
  token, so the residue stays visible in the row text), punctuation
  /invisibles declare `decision-store`. The five rows of the
  spec-079 table are amended in lockstep, with an amendment note in
  step-classification.md recording that spec 090 superseded the
  "Declaration after 079" cells for these rows. The answer-store
  evidence layer (marks per-toggle, characters additions,
  punctuation inventory answer) and the convenience shim are KEPT:
  they are the within-step draft/evidence surface, which is exactly
  the narrowed role T026's store text describes.
  *Consequence for the pinned table:* five rows amended plus a
  written amendment note — the 079 contract's end-state column no
  longer describes these steps without the note; the pin test stays
  green because manifest and table move together, and the kind union
  (079 vocabulary) gains a member by 090's hand, visible in both
  files' history. *Consequence for 091:* the declarations become
  truthful and machine-readable at the moment 091 starts deriving
  step membership over the manifest/declaration surface: a
  `decision-store` step is exactly a step whose settled state is a
  decision record, so 091's derivation (and its FR-005 parity
  rewrite) can key decision-backed membership off the declaration
  instead of re-deriving it from the registry.

  **Option (b) — residue reading, vocabulary untouched.** Keep the
  kind union exactly as spec 079 left it; reinterpret the
  declaration (documented in `steps/types.ts`) as naming where a
  step's NON-decision residue persists. Characters / punctuation /
  invisibles: `phase-b-draft` → `answer-store` (their residue —
  position, evidence layer — is answer-store state); marks /
  convenience stay `answer-store` (the D-090-17 status-slot reading,
  generalized). Evidence layer and shim kept, as in (a). Only the
  three `phase-b-draft` rows change in the table; the
  `phase-b-draft` kind itself either stays in the union as
  defined-but-unused vocabulary or is struck — striking it is the
  same species of 079 amendment as (a)'s addition, so the clean
  form of (b) keeps it, unused.
  *Consequence for the pinned table:* three rows amended, no
  amendment note strictly required (the tokens stay within 079's
  vocabulary), but the table's declaration column stops answering
  FR-007's question ("where a step's answers are kept so that
  leaving and returning loses nothing") for the five steps — the
  alphabet, the marks composite and the retained set are declared
  NOWHERE; a reviewer reading the table learns where the residue
  lives, not where the answers live. *Consequence for 091:*
  declarations become actively ambiguous for derivation — identity,
  track and help (pure question steps) share `answer-store` with
  the five decision-backed steps, so 091 cannot distinguish
  decision-settled steps from answer-store steps by declaration and
  must hard-code or registry-derive the set its membership
  derivation was supposed to read off the manifest.

  **Option (c) — T026's letter, executed literally (eliminate the
  evidence layer).** Remove the remaining gallery answer writes so
  the task text's premise is made true: marks records per-toggle
  into the value (reopening D-090-11's rejected design — the value
  can carry per-toggle `answers` with `completion: null`, but spec
  079's evidence lifecycle — savedAt/stage/evidence keys, read by
  `steps/evidence.ts` key fns — has no home in the value and would
  need a new carrier or be dropped); characters' addition answers
  and punctuation's inventory answer likewise move into their
  values or vanish; the convenience adoption shim is RETIRED with
  its slot (pre-T024 drafts' restored convenience booleans become
  unreadable — no orphan surface exists for answer-store residue,
  so that state is dropped, contrary to the 087 Q5 / 088 T030
  "surfaced, never dropped" precedent the rest of US2 followed).
  Declarations then follow (b)'s tokens (`answer-store` residue =
  position/status only) and the same three table rows are amended.
  *Consequence for the pinned table:* as (b) for the tokens, plus
  D-090-11 and D-090-16 require superseding entries (their recorded
  rationale — evidence lifecycle, guard idempotence — is overridden
  by the ruling, not by new evidence), and spec-079 evidence
  suites re-point or lose coverage. *Consequence for 091:* the
  cleanest store story (surveyAnswerStore = question steps +
  position/status only, T026's checkpoint text verbatim), but the
  marks/characters recording redesign lands under 090's tail task
  rather than as its own adjudicated change, and 091's parity
  surface (FR-005 rewrite) inherits whatever the redesign does to
  the evidence lifecycle as a fait accompli.

  **What is NOT in dispute across the options:** the store keeps
  its name (research Q4); the header documents the narrowed role
  under every option; `phase-b-draft` cannot survive as a
  declaration for any step (its store is deleted) — the options
  differ in what replaces it and in the fate of the evidence layer,
  not in whether the status quo is declarable. **Stopped for the
  lead's ruling.**

- **D-090-20 — T027 executed; the marks/characters/punctuation
  `saveAnswer` ban is deferred to the T026 ruling (D-090-19), and
  that deferral is itself a consequence the ruling must price.**
  Both FR-003 lists are extended in this change.
  `galleryWriteAudit.test.ts` gains two US2 entries: (1) all Phase
  B/C renderer trees (CharactersStep, PhaseB, CharacterMapPane,
  marks/, punctuation/, invisibles/, convenience/) ban
  `usePhaseBDraftStore` — the deleted store's hook is the precise
  signature of the retired write path, because the phaseBDraft
  accept/decline/setter action NAMES survived the migration as pure
  functions over the values (phaseBDraftOps.ts) and as gallery-host
  hook methods (useInventoryDraft.ts) and are therefore the
  sanctioned decision path, not bannable identifiers; (2)
  invisibles/ + convenience/ additionally ban `saveAnswer` — the
  two trees whose answer writes US2 retired in full (D-090-17).
  eslint.config.mjs mirrors both entries as two new overlay blocks
  (the US1 block refactored onto a shared `galleryWriteBanRule`
  builder, behaviour unchanged); a planted `saveAnswer(` in the
  invisibles tree errors under the overlay (verified, plant
  removed), and the audit test is green (4/4). **Deferred:** a
  `saveAnswer` ban over marks/ (16 live calls), CharactersStep.tsx
  (1) and punctuation/ (1). Those calls are the spec-079
  answer-store evidence layer whose fate IS D-090-19's question;
  registering the ban today would either red both gates or force
  option (c) before the lead rules. The deferral is recorded in
  both list files at the registration site. **Interplay flagged
  for the ruling:** T060/SC-002 asserts the final FR-003 lists
  leave ZERO exceptions — under ruling (a) or (b) the evidence
  layer survives as the store's sanctioned residue, so SC-002's
  zero-exceptions claim can only be met by carrying this ban
  exception with the ruling cited, or by reading the evidence
  layer as outside FR-003's "gallery answer" scope (it is the
  answer store's own draft surface, spec 079's design, not a
  gallery write-around); under (c) the ban lands with the
  elimination and no exception exists. The ruling should say
  which. **SC-004 grep recorded (T027):** `phaseBDraftStore` —
  zero references in packages/studio/src and packages/studio/tests
  (code and tests; reached at T025, D-090-18); remaining repo hits
  are historical prose only (specs 047/050 as-built documents,
  engine source comments, one e2e comment narrating the old
  durability argument).

- **D-090-21 — T028 verified: what remained after T025's early
  discharge.** T025's suite rename (phaseBDraftStore.test.ts →
  survey/phaseBDraftOps.test.ts, D-090-18) discharged the ops-level
  re-point; the marks contract + guards-determinism suite landed at
  T023 and the convenience contract at T024. Verified present and
  green at this checkpoint: marksTreatment.test.tsx (8 cases,
  incl. `runApplyDeterministically` over the guards + the
  context-tolerance patch), retainedConvenienceChars.test.ts
  (contract + no-op apply), and the T028 reload test — already
  present as draftPersistence.test.ts's round-trip family ("the
  build-list alphabet folds into the durable draft round-trip",
  decisions-carried since T021: restores the in-progress alphabet,
  digraphs, and font from the `decisions` slice; the legacy-slice
  variants beside it are T025's migration tests). Written new at
  T028, in the house contract shape: characterInventory.test.ts
  (contract — requires pinned to the step's declared three; no-op
  apply determinism; extract probe: undefined on null/empty IR,
  produced set seeded with `base` provenance, deterministic),
  punctuationInventory.test.ts and invisiblesInventory.test.ts
  (contract + deterministic no-op apply over InventoryDecisionValue
  fixtures). Batch: the five gallery suites + draftPersistence
  130/130.

- **D-090-22 — T029 gate (in progress): fixtures regenerated for the
  post-merge signature; two 090 bookkeeping failures found by the
  gate run and fixed; full accounting below.** (1) **Golden walk:**
  fixtures regenerated via the harness write path and re-verified
  (write run 2/2, compare run 2/2). The semantic diff vs the US1-era
  fixtures is 7 field deltas per track, ALL purely additive decision
  `record` insertions: layout/choose_base/touch_seed_source gain
  `record` in `storeMutations` (the 089-restack unified spy now
  feeds both lists — the both-instruments harness shape), and the
  characters entries gain their US2 records (prefill:
  `decisionMutations` +2 and `storeMutations` +2 around
  `setCharactersSubStage`; B: +1/+1). Zero removals, zero
  navigation/content/other-store deltas — the expected post-merge +
  US2 signature, nothing else. (2) **registry.test.ts (2 failures,
  fixed here):** the invariant still asserted the pre-090 registry
  (114 entries, membership groups without the gallery group) while
  T008 registered the 14 gallery modules in the same registry
  (R2's design) — count now 128 with the comment re-derived
  (114 question + 14 gallery), and `galleryModules` joins the
  membership total. 090 Foundational bookkeeping, missed because
  focused batches never ran this file; the full gate did. 8/8
  after the fix. (3) **stepHost.renderSmoke.test.tsx (2 failures,
  fixed here):** the touch_seed_source stub mocked the panel's
  pre-US1 path (`editors/touchSeedSource/TouchSeedSourcePanel.tsx`,
  deleted by T012's move to `survey/touchSeedSource/`) and the old
  export name; the mock now targets the moved file and stubs
  `TouchSeedSourceRenderer`. 26/26 after the fix. Both pairs are
  among the previously unaccounted failures in the stale-tree
  accounting the lead flagged (8656 passed / 12 failed: 4 SC-004
  corpus + 2 goldenWalk + 2 renderSmoke + 2 registry = 10 named;
  the current-tree full run below is the authority for any
  remainder). (4) **Two more from the batched run, same bookkeeping
  family, fixed in the gate follow-up:** (i)
  questionModules.test.ts definition-contract snapshot — stale on
  T023's marks `writes [groups, stores]` and carrying an obsolete
  entry for the T025-deleted `b/pb_character_inventory.ts`;
  refreshed with -u, diff verified to contain exactly those two
  changes. (ii) windowsLayout.test.tsx renderer test seeded the
  survey context through `useSurveySessionStore.setSurveyContext`,
  removed by 089's re-point (the renderer now derives bcp47 from
  decisions, LayoutStep.tsx:66-69); re-seeded via the identity
  decisions exactly as LayoutStep.test.tsx does. Both files green
  after the fix. (iii) 089's draftPersistence.decisionRecord.test.ts
  (SC-009) still listed `phaseBDraft` among the envelope's
  pre-existing fields; T025's ruled deletion removed the key, so the
  expectation now omits it with the ruling cited inline.
  (iv) tests/survey/orphan-input-lint.test.ts: the pre-090 lint
  required every registry module to be survey-manifested (classes:
  RELOCATED, RESERVE); the 14 gallery modules are a third class —
  step-hosted decision modules, author-reachable through their
  hosting steps but never walked as survey questions. Added a
  HOSTED_EXEMPT class derived from the registry's galleryModules
  group (cannot drift from the module list), rationale inline; the
  lint's other guards unchanged. Green after the fix. The shell-b
  batch additionally showed 45 file-level failures with zero test
  failures — environmental (ENOSPC on the 512 MB /tmp tmpfs +
  worker kills under cross-worktree memory contention), re-run in
  small chunks for the record. (5) **Full suite:** the first attempt on this VM was
  OOM-killed twice (concurrent sibling-worktree runs; exit 137 in
  transform) and re-run in directory batches (maxWorkers 2, then 1
  for the heavy trees). **Final accounting, current tree:**
  decisions 974 passed / 4 failed — the pre-existing local-corpus
  SC-004 four (basic_kbdru + arabic_izza in successCriteria.sc004
  and .sc004.kmp; the corpus is absent in this sandbox and these
  fail identically on the base); steps+tests/steps 499/499
  (goldenWalk regenerated fixtures and the renderSmoke fix inside);
  survey 1953 passed / 2 failed, both fixed above and re-verified
  green; stores+lib 1754 passed / 1 failed (fixed, re-verified) /
  1 skipped (pre-existing); editors 1348/1348; shell-a 98/98;
  shell-b 1437 passed / 1 failed (the orphan lint, fixed,
  re-verified 6/6) with its 45 environmental file failures re-run
  green in chunks (335 tests). tsc: all six packages clean.
  eslint: clean. depcruise: 2 — the post-089-merge baseline,
  unchanged. The only failures standing are the 4 SC-004 corpus
  ones, pre-existing and environmental. PR opening is the lead's
  step per series protocol.

- **D-090-23 — US3 opening: T030 verified discharged by the
  Foundational stub; T031 R1 rows re-verified against the branch,
  one refinement.** T030: `CarveRemovalItem` in carvedLayout.ts is
  the ruled flat shape (kind node|item|family|char, id, provenance
  asked|derived|extracted) and `CarvedLayoutValue` =
  {removals, dispositions (contracts CarveDisposition),
  closedKeyboardCard} per data-model.md. T031: carve writes are
  the workingCopyStore overlay Sets (deletedNodeIds /
  deletedItemIds / disabledFamilyIds / carveChars /
  carveDispositions / closedKeyboardCard, workingCopyStore.ts:576-
  659) via cascadeDelete/cascadeRestore/restoreAll/keepAll
  (:1886-1903ff) plus prefillCarveDispositions (:975) called from
  CarveGalleryV2's effect (:825-836); applyCarveMutate consumes the
  overlay in lib/projectWorkingCopyVfs.ts (:443-454). ALSO a
  second cascadeDelete caller R1 did not list: MechanismGallery
  (assign loop) routes its removals through the same action
  (:3689-3700) — the overlay is shared infrastructure, so T032's
  re-point must keep the assign loop's path working or migrate it
  too. Deadkeys: editors call workingCopyStore.commitDeadkeyOp
  (:1108) with ops built in editors/deadkey/deadkeyWrite.ts —
  R1's row holds. Rules refinement: RulesStep holds NO local
  builder state — RuleBuilderMount/RuleListMount write the working
  copy directly and the step reports onComplete(undefined)
  ("the step's result lives in the working copy", RulesStep.tsx:
  50-57); R1's "builder-owned state" means the builder mounts +
  guardIntentStore, and the ruleSet value/extract work from the
  built rules in the IR, as R1's extract note said.

- **D-090-24 — T032 STOPPED at an assumption failure: 089's
  apply-contract has no channel for the carve overlay. Lead ruling
  requested; options below.** T032's text assumes "apply writes the
  overlay's applied view through the existing pipeline". Verified
  facts: (1) A module apply returns a WorkingCopyPatch whose
  channels are ir / identity / attribution / helpDocs /
  historyEntryState (survey/types.ts:216-227); overlay channels are
  authorized per-module by 089's data-model channel table, and the
  runner rejects an unauthorized channel with ApplyChannelError,
  applying nothing (089 contracts/apply-contract.md A3/A5). No
  carve-overlay channel exists in that table. (2) The carve overlay
  (workingCopyStore Sets + dispositions + closedKeyboardCard) is
  not an IR slice: the applied view (carved IR / emitted .kmn) is
  produced by lib/projectWorkingCopyVfs.ts from baseIr + overlay +
  session aggregates (effectiveItemIds' tainted-contributor union,
  entry-group deferral, rule-additions splice), with applyCarveMutate
  as the canonical seam — none of those inputs are in ApplyContext
  (ir / writes / decisions / currentHistoryEntryState only).
  (3) The overlay DOES persist today inside the draft's workingCopy
  slice, so in-session resume does not depend on the decision.
  Options: **(a)** Characters-precedent cut: the module ships value
  + extract + step-side recording (the adapter records the
  overlay-derived value on change/complete, as CharactersStep
  records its additions); apply = () => ({}) like
  characterInventory's; the applied view keeps being written by
  projectWorkingCopyVfs from the persisted overlay. Cost: 092/093
  replay-from-decisions cannot re-assert the overlay — 093's
  planned I-1 overlay accumulator becomes the place that must grow
  a carve channel, a named downstream delta. **(b)** Add a
  `carveOverlay` channel to WorkingCopyPatch + 089's authorization
  table from inside 090: amends a completed, PRed spec's contract;
  the runner (088/089 code) and applyWorkingCopyPatch must learn
  the channel — cross-spec change, needs lead/owner adjudication,
  and 089's PR #1974 would no longer match its contract. **(c)**
  Carve apply returns the carved IR through the ir channel
  (writes [groups, stores], applyCarveMutate over ctx.ir +
  value-derived sets): two producers of the carve result with
  different inputs — the pipeline's effectiveItemIds aggregation,
  entry-group deferral, and rule-additions splice are not
  reproducible from the value alone, so apply's output can diverge
  from the emitted artifact's; the golden walk compares emitted
  bytes and would be the arbiter, but a permanent dual-producer
  arrangement contradicts the seam's canonical-producer design.
  Implementer's assessment: (a) is the only option inside 090's
  authority and matches the T021/T022 precedent; (b) is the
  architecturally complete answer if the lead wants replay
  supported from 090 already; (c) is not recommended. T032 is
  STOPPED pending the ruling. NOT gated on it: T033 (deadkey ops
  replay to groups/stores patches — IR-channel-expressible via
  deadkeyWrite/DEADKEY_WRITES), T034 (rule additions are IR
  groups), T035's deadkeys/rules lists, T036's deadkeys/rules
  tests — proceeding with those.

- **D-090-25 — T033 done: deadkeys-defined rebuilt (op-log value,
  replay apply, step-side recording); the op machinery re-homed to
  survey/deadkeys/ under the depcruise boundary.** Value =
  { ops: readonly DeadkeyOperation[] }; apply replays the ops over
  ctx.ir via applyDeadkeyOpsToIr and returns the groups/stores/raw
  subtrees when anything changed ({} for no value / no IR / empty
  log / full precondition-skip — so replay over the live IR, which
  already carries the edits, is a safe no-op). writes =
  [groups, stores, raw] (DEADKEY_WRITES) and decisionIRPaths maps
  the decision correspondingly; deadkeys-defined left the
  IR-less allowlist in decisionIRConsistency.test.ts; the
  questionModules snapshot refreshed (diff = the deadkeys writes
  line only). Recording: DeadkeyAdapter records the overlay's ops
  as the decision on step completion (base-keyboard precedent);
  the module renderer is survey/deadkeys/DeadkeyDecisionRenderer
  (the surface, reporting the op log through onChange on
  completion). No extract (rationale in the module header: base
  deadkeys ride the base IR; ops are author edits only).
  **Boundary finding:** dependency-cruiser's
  question-modules-no-bypass-mutate-seam rule forbids survey/
  questions/** importing stores/, editors/, OR lib/ at all — the
  stub's "re-home the op type to an importable layer" was therefore
  load-bearing. The op union, overlay/value shapes, the single-op
  applier, and the IR replay moved to survey/deadkeys/deadkeyOps.ts
  (the survey feature-home pattern: markGuards, phaseBDraftOps);
  lib/deadkeyOps.ts keeps applyDeadkeyOpsToVfs (the projection
  replay, now calling the shared applier) and re-exports the types,
  so all ten existing importers are untouched. First attempt
  (module importing lib/ + editors/adapters/) scored depcruise 4;
  after the re-home it is back to the baseline 2. New module suite
  deadkeysDefined.test.ts (contract + deterministic replay +
  live-state no-op) plus the lib/editor suites green; tsc + eslint
  clean.

- **D-090-26 — T034 done: rule-set module (builder-result value,
  splice apply, step-side recording); ruleAdditions re-homed to
  survey/rules/.** Value = RuleSetValue, an alias of the builder
  seam's DerivedRuleAdditions (marked added IRRules/IRStores per
  group + workingOrder) declared beside the seam in
  survey/rules/ruleAdditions.ts (D-090-8 pattern). apply splices
  the additions into ctx.ir via spliceRuleAdditions with the
  deletion set taken from the recorded carved-layout decision's
  removals — so an addition the author carved away is never
  resurrected (pinned by a dedicated test) — and returns the
  groups/stores subtrees. writes [groups, stores]; decisionIRPaths
  maps rule-set; it left the IR-less allowlist. Recording:
  RulesStep.complete() records the derived value (currentRuleSetValue
  in survey/rules/ruleSetValue.ts, shared with the renderer) before
  onComplete — the step is its own adapter (manifest hosts it
  directly); the module renderer is RulesDecisionRenderer wrapping
  the step. No extract (additions are a working-vs-base diff of
  session work; rationale in the module header). ruleAdditions.ts
  and its test moved lib/ → survey/rules/ for the same boundary
  reason as D-090-25; its three lib/hooks importers re-pointed,
  behaviour unchanged (ruleAdditions + projection suites green).
  Snapshot refreshed (ruleSet writes line only). Gates: module +
  rules trees (355) + pins (459 in the earlier batch) green; tsc /
  eslint clean; depcruise baseline 2.

- **D-090-27 — T035 partially discharged; the Phase D action bans
  and T032/T036-carve/T037 are gated on ONE lead question, and a
  T033 deviation is flagged for adjudication.** Done now: the
  usePhaseBDraftStore ban extended to the Phase D trees in both
  FR-003 layers (audit 4/4 incl. firing probe; eslint clean);
  SC-004 grep re-run: zero code references (one prose mention in
  the audit file's own comment). **The gated remainder:** T035's
  action bans (cascadeDelete/cascadeRestore/restoreAll/keepAll/
  prefillCarveDispositions/commitDeadkeyOp) presume the
  host-mediated design in which editors never touch the working
  copy directly. As built, T033/T034 follow the characters/marks
  precedent instead: the overlay/op-log remain the edit-time write
  path, the decision records them at completion, and apply serves
  replay. **Deviation flagged:** the lead's T033 paraphrase said
  "step-side op commits become value updates through the host" —
  T033 as built keeps commitDeadkeyOp as the internal commit and
  records the log at the adapter; the reason is the same wall as
  D-090-24: the projection (projectWorkingCopyVfs) reads the
  deadkey overlay and the carve overlay from the working copy, and
  no contract channel exists for a decision/host to write those
  overlays — so "value updates through the host" cannot land in
  090 without either (b)-style contract work or a projection
  re-point to read decisions. **The one question for the lead:**
  ratify the record-from-working-copy precedent for US3's
  editor-backed decisions (carve included — D-090-24 option (a)),
  with the overlay-channel/projection question handed to 092/093
  as a named delta; or direct the (b) contract work in 090 before
  US3 closes. Until ruled: T035's action bans unregistered
  (registering them would red the gate against the as-built
  design), T036's carve cases and T037's gate wait on T032.
  T036's deadkeys/rules module suites are written (in the T033/
  T034 commits: replay determinism, live-state no-op, splice
  order + carve-non-resurrection).

- **D-090-28 — 089 pass-2 apply semantics absorbed (lead relay
  2026-10-07, landed on km/decision-apply @ 24c213c3; reaches this
  branch at the next restack): applyDecisionEffects gains an
  input-triggered second pass — a module declaring apply + requires
  also runs, with value undefined, when a completion records one of
  its required decisions, and must compose from ctx.decisions.**
  Audit of every apply already built in 090: the trivial
  `() => ({})` modules (base-keyboard, windows-layout,
  touch-seed-source, characters, punctuation, invisibles,
  convenience) are pass-2 safe by construction. The three applies
  with real logic all guarded `value === undefined → {}` — correct
  for "never answered", wrong for pass 2 when the module's own
  decision was recorded earlier: **marksTreatment, deadkeysDefined,
  and ruleSet now resolve their effective value as
  `value ?? ctx.decisions[<own id>]?.value`** before their existing
  guards, so a pass-2 invocation composes from the recorded value
  and stays a no-op when none exists. Each suite gained a pass-2
  pin (invoked with undefined: composes with a recorded own
  decision, no-ops without one). Carve (stub, D-090-24) and the
  US4 modules will be authored to this contract from the start.
  Gates: the three suites + coverage + audit 67/67; studio tsc
  clean.

- **D-090-29 — LEAD RULING on D-090-19 (T026): Option (a) —
  declare the decisions slice (lead rulings message, 2026-10-07).**
  `"decision-store"` is added to the `PersistenceDeclaration`
  union in `steps/types.ts`; the five US2 steps are re-declared
  decision-store-first — characters keeps its dual form
  (`` `decision-store` (alphabet) + `answer-store` (sub-screen
  position, manual-path answers) ``), marks and convenience
  declare `decision-store` with their answer-store
  evidence/status residue named in the manifest comment,
  punctuation and invisibles declare `decision-store` — and the
  five rows of the spec-079 step-classification table are
  amended in lockstep WITH an amendment note recording that
  spec 090 superseded the "Declaration after 079" cells for
  these rows. The answer-store evidence layer (marks
  per-toggle answers, characters' addition answers,
  punctuation's inventory answer) and the convenience adoption
  shim (D-090-17) are KEPT: they are the narrowed store's
  sanctioned role — within-step draft/evidence state, exactly
  what T026's store text describes. **Scope determination for
  D-090-20 / T060 (stated by the ruling):** the evidence layer
  is spec 079's own draft surface, not a gallery write-around —
  FR-003's ban targets gallery components writing answers IN
  PLACE OF decision records. The `saveAnswer` bans over
  marks/characters/punctuation deferred in D-090-20 are
  therefore NOT registered: not as an exception, but as a scope
  determination, cited at the registration sites in both FR-003
  list files (the audit test and the eslint overlay). T060's
  zero-exceptions assertion reads on the banned category so
  defined. Options (b) and (c) are rejected: (b) leaves the
  declarations actively ambiguous at exactly the surface 091
  derives step membership from — the table would stop answering
  where the five steps' answers live; (c) eliminates the
  evidence layer by reopening D-090-11's rejected design and
  retiring the convenience shim, dropping pre-T024 drafts'
  restored booleans with no orphan surface — contrary to the
  087 Q5 / 088 T030 "surfaced, never dropped" precedent the
  rest of US2 followed, and overriding recorded rationale
  without new evidence. Executed at T026.

- **D-090-30 — LEAD RULING on D-090-24 (T032): Option (a) —
  the characters-precedent cut (lead rulings message,
  2026-10-07).** The `carved-layout` module ships value +
  extract + step-side recording; `apply = () => ({})` like
  characterInventory's; the applied view keeps being produced
  by `projectWorkingCopyVfs` from the persisted overlay. Two
  conditions attach: (i) the recorded value must suffice to
  reconstruct the overlay state that produces the applied view
  (removal items + dispositions); purely presentational state
  (e.g. card collapse) is exempt — an overlay component that
  is authorial, view-affecting, and NOT capturable in the
  value stops on that component alone and is reported to the
  lead; (ii) the downstream delta is recorded in the spec's
  duplication ledger / followups as a named handoff (see
  D-090-31). Option (b) is rejected: amending 089's PRed
  apply contract mid-flight from inside 090 is cross-spec
  overreach, and PR #1974 would no longer match its contract.
  Option (c) is rejected: two producers of the carve result
  with different inputs can diverge from the emitted artifact,
  contradicting the seam's canonical-producer design.
  Executed at T032.

- **D-090-31 — LEAD RULING on D-090-27: the
  record-from-working-copy precedent is RATIFIED for US3's
  editor-backed decisions (lead rulings message, 2026-10-07).**
  Overlays/op-logs remain the edit-time write path for carve
  (D-090-30), deadkeys (T033 as built) and rules (T034 as
  built); the decision records them at completion; `apply`
  serves replay where the contract has channels. The T033
  deviation from the lead's earlier paraphrase ("step-side op
  commits become value updates through the host") is closed
  by this ratification: no contract channel exists for a host
  to write those overlays, and the projection reads them from
  the working copy. Consequences executed under this ruling:
  T035's Phase D action bans (cascadeDelete / cascadeRestore /
  restoreAll / keepAll / prefillCarveDispositions /
  commitDeadkeyOp) are NOT registered — they presumed the
  host-mediated design this ruling sets aside, and registering
  them would red the gate against the ratified design; the
  non-registration + rationale is recorded at the T035 site
  in both FR-003 list files so T060 does not read it as a
  gap. T036's carve cases proceed under D-090-30 (the no-op
  apply pinned as such); T037's gate proceeds. **Named
  downstream handoff (from D-090-30 condition (ii)):** 093's
  I-1 overlay accumulator grows a carve-overlay fold —
  reconstruct the overlay from carved-layout decision values
  during replay; 092's T037 (prefillCarveDispositions) remains
  pending on carve until that fold exists.

- **D-090-32 — T026 executed under ruling D-090-29 (option (a)).**
  `steps/types.ts`: `"decision-store"` added to
  `PersistenceDeclaration` (with the vocabulary note; `phase-b-draft`
  stays as defined-but-unused 079 vocabulary). `steps/manifest.ts`:
  characters / marks / punctuation / invisibles / convenience
  re-declared `decision-store`, each manifest comment naming its
  answer-store residue (characters: sub-screen position +
  manual-path answers; marks: per-toggle evidence answers +
  step-status slot; punctuation: one evidence answer; invisibles:
  none — writes retired in full at T022; convenience: step-status
  slot + the legacy-boolean adoption shim's read source).
  `specs/079-.../step-classification.md`: the five rows amended in
  lockstep plus the amendment note recording that spec 090
  superseded those cells. `surveyAnswerStore.ts` header now
  documents the narrowed role (no gallery DECISION is held there;
  the evidence layer + status/position residue + shim source are
  the sanctioned remainder). Census re-verified at execution: the
  only gallery `saveAnswer` call sites left in src are the evidence
  layer itself (MarksSeriesStep per-toggle, CharactersStep:147
  additions, PunctuationStep:481 inventory answer) — zero gallery
  decision values in the store. FR-003 sites updated per the
  ruling's scope determination (D-090-29): the deferred
  marks/characters/punctuation `saveAnswer` bans are recorded as
  NOT registered in both list files, as a scope determination for
  T060 to read, not an exception.

- **D-090-33 — T032 executed under ruling D-090-30 (option (a),
  characters-precedent cut) + D-090-31 ratification.** The module
  ships value + step-side recording + a decision renderer; `apply`
  stays `() => ({})`, now documented as the ruled shape (no
  carve-overlay channel exists in 089's contract; the applied view
  keeps being produced by `projectWorkingCopyVfs` from the
  persisted overlay — the canonical producer). Value types + the
  pure builder moved to the carve feature home
  (`survey/carve/carveValue.ts`, D-090-8 pattern; the module
  re-exports): `carvedLayoutValueFromOverlay` maps the four
  removal sets to one kind-discriminated item list, canonical-
  sorted by (kind, id) so click order cannot change the recorded
  value, and rides dispositions + closedKeyboardCard verbatim;
  `currentCarvedLayoutValue()` is shared by the recording and
  rendering surfaces (currentRuleSetValue precedent). Recording:
  `CarveAdapter` records `{carved-layout, value, asked}` on
  completion (DeadkeyAdapter precedent, verbatim shape);
  `survey/carve/CarveDecisionRenderer.tsx` hosts the same gallery
  under the decision host and reports the value via `onChange`.
  No `extract` (data-model's rule: only where a starting-point
  seed exists today — carve proposals are in-gallery suggestions,
  never an overlay seed; deadkeys no-extract precedent).
  **Per-item provenance is `asked` for every recorded item,
  deliberately:** in the live flow every overlay removal is an
  author action (gallery cascadeDelete handlers; the assign
  loop's cascadeDelete route, D-090-23) and no proposal-
  acceptance or starting-point seeding path writes the overlay,
  so a derived/extracted split recorded today would be
  fabricated. Those values become producible when the seeding
  paths land (092). **Ruling condition (i) audit:** the value
  covers every overlay component that can be non-trivial at
  carve completion and feeds the applied view — the four
  removal sets, dispositions, the card. Two named observations:
  `disabledFamilyIds` is captured as it stands at completion
  (in the live flow only the rules step's toggle writes it,
  after carve, so family items are normally absent at record
  time — faithful capture, no carve-step view impact); and
  `carveTouchKeepInert` has NO live writer (its only UI,
  TouchKeepInertControl, is an unmounted stub), so it is always
  empty in the live flow — if that surface ever mounts, the
  value needs a field for it (added to the D-090-31 handoff
  note). **T032's text is superseded by the rulings in two
  clauses:** the apply-through-the-pipeline clause (D-090-30)
  and the undoStack re-point (D-090-31: the overlay remains
  the edit-time write path, so undo keeps operating on it);
  the "commits through onChange" clause holds under the
  decision host (the renderer), while the live manifest path
  records step-side — the ratified precedent, as T033 was
  built. Gates at the T032 checkpoint: studio tsc clean;
  questionModules (806) + decisionIRConsistency (393) +
  registry (8) = 1207/1207.

- **D-090-34 — T035 completed under ruling D-090-31.** The ungated
  slice (the Phase D trees join the `usePhaseBDraftStore` ban in
  both FR-003 layers) landed at cd7b1f03. The remainder — the six
  action bans T035's text names — is discharged as a RULED
  NON-REGISTRATION: the non-registration + rationale is recorded
  at the T035 site in both list files (the audit test's US3 entry
  and after-list note; the eslint overlay's US3 comment), as a
  scope determination for T060 to read — not a gap, not an
  exception. The named downstream handoff (D-090-30 condition
  (ii)) is recorded in spec.md's duplication ledger on the
  "overlays as independent state" row: 093's I-1 overlay
  accumulator grows a carve-overlay fold; 092's T037 remains
  pending on carve until that fold exists (with the D-090-33
  carveTouchKeepInert addendum).

- **D-090-35 — T036 executed: contract + determinism for the three
  US3 applies.** deadkeysDefined.test.ts and ruleSet.test.ts were
  written with T033/T034 (replay determinism, live-state no-op,
  splice order, carve-non-resurrection, pass-2 pins — re-run here,
  5 + 5 green). carvedLayout.test.ts is new (10 tests): the module
  contract (provides/requires/writes/renderer/extract-undefined);
  the ruled no-op apply under the SC-005 frozen-stores harness
  (`runApplyDeterministically`) and under a pass-2 invocation; the
  value builder — the four sets mapped to one kind-discriminated
  list with dispositions + card verbatim, canonical (kind, id)
  ordering so click order cannot change the recorded value, an
  orphaned hand-set removal kept verbatim (spec edge case — the
  builder snapshots the overlay and never filters against a target
  list), a proposal refresh (dispositions re-prefilled under a new
  card state) leaving hand removals identical, and the empty
  overlay recording an empty value; plus `currentCarvedLayoutValue`
  against the live store. 20/20 across the three suites.

- **D-090-36 — T037 gate: golden-walk fixture regeneration,
  adjudicated (two `record` deltas, both intended).** The walk
  failed against the T029-era fixtures with exactly two
  insertions per track, nothing else: (1) the `carve` step's
  `decisionMutations [] → ["record"]` (+ `record` leading its
  storeMutations) — T032's CarveAdapter recording firing in the
  harness (the real adapter wraps the mocked gallery, so the
  recording is exercised here even though the gallery is a
  stub); (2) the `rules` step's identical delta — T034's
  RulesStep recording, latent since T034 because the walk was
  not among that slice's gates (D-090-26's list). No
  workingCopyMutations changed anywhere — the applied view is
  untouched, exactly as ruling D-090-30 requires (recording
  added; the projection still produces the view). `deadkeys`
  shows no record because the harness mocks deadkeyAdapter
  (studioShellMocks stub) — T033's recording is covered by the
  deadkey suites, not the walk. Regenerated with the harness's
  write-on-first-run mechanism; the old↔new JSON diff is
  exactly the two insertions per track. This is the same
  adjudicated family as the T013 and T029 regenerations: a new
  decision recording at a migrated step is the migration's
  intended signature, not drift.
- **D-090-37 — verification debts from the lost T037 run discharged
  (continuation agent, lead direction).** (1) The three pass-2 pin
  suites (D-090-28) re-run against 089's ACTUAL runner change as
  merged at b6567241 (km/decision-apply @ 24c213c3): marksTreatment
  9/9, deadkeysDefined 5/5, ruleSet 5/5 — 19/19 green, each suite's
  pass-2 pin (invoked with value undefined: composes from
  ctx.decisions when a recorded own decision exists, no-ops without
  one) passing against the real second pass, not the relay
  description. (2) T037 checkbox reconciled: the gate commit
  c53e001e + D-090-36 establish the golden-walk half of the gate
  (fixtures regenerated for the adjudicated US3 signature; walk
  green 2/2 post-regen, applied view untouched). The full-suite /
  tsc / lint accounting of the original T037 run was lost when that
  agent's background exec vanished; per lead direction the checkbox
  is checked on the walk evidence and the full-suite classification
  rides on T045's gate run, which must classify the whole suite on
  the US4 head — any failure there beyond the known 4-corpus budget
  reopens T037's accounting.
- **D-090-38 — T040 executed: R1 rows for mechanisms/touch re-verified
  (both hold, line drift only — amendments on the rows); the US4
  execution shape is fixed by the same wall as D-090-12/D-090-24.**
  `WorkingCopyPatch` channels are ir / identity / attribution /
  helpDocs / historyEntryState only. Neither `desktopLocked` (a bare
  store boolean), nor the `touchLayoutJson` string, nor the phase-C
  `phaseResults` entry is reachable from an `apply` — so T041's
  "apply performs the R1 lockDesktop effect" and T042's "apply
  performs the R2 buildTouchLayoutJson + setTouchLayoutJson work"
  are not implementable inside 089's contract, exactly as T024's
  "applied view written by apply" was not (D-090-12). Execution
  under the ruled precedents (D-090-30 option (a); D-090-31
  ratification of record-from-working-copy for editor-backed
  decisions):
  *physical-layout (T041):* value = the phase-C assignment list —
  contracts `MechanismAssignment[]`, each keeping its `source`
  provenance (data-model shape `{ assignments }`; the T008 stub's
  `Record<string,string>` is re-pinned to the gallery's own record
  shape). Pure builder + `currentPhysicalLayoutValue()` in a survey
  feature home, shared by recording and rendering (D-090-33
  pattern). `AddPhysicalAdapter` records
  `{physical-layout, value, asked}` on completion (CarveAdapter
  shape). `apply` is a no-op, `writes: []` (assignments touch no IR
  channel; their applied view is the `phaseResults` entry).
  `recordAssignments` stays the edit-time write path producing that
  applied view (D-090-31). R1's two effects — `lockDesktop()` and
  the staleness-gated `repropagate` — re-home to the step's
  completion wiring (see below) with identical deps and ordering;
  the reducer's MECHANISMS case is deleted and `mechanisms` leaves
  `STEPS_WITH_APPLY_COMPLETION`.
  *touch-layout (T042):* value =
  `{ ops: KeyEditOperation[], deletedTouchKeyIds: string[] }`
  (data-model shape), snapshotted from `keyEditOverlay` +
  `deletedTouchKeyIds` at completion; builder +
  `currentTouchLayoutValue()` likewise. `AddTouchAdapter` records
  on completion. `apply` is a no-op, `writes: []`: the ops replay
  onto the gallery's derived layout, not the IR (no analogue to
  deadkeys' IR replay), and the serialized JSON is a derived
  string with no patch channel. R2's build — inputs already
  assembled adapter-side (baseIr, baseVfs, mods via
  `deriveDesktopModifications`, seedSource) — plus
  `setTouchLayoutJson` and `clearStale("touch")` re-home to the
  completion wiring with the reducer's exact semantics (baseIr-null
  clears; warnings logged; a build throw degrades to null, never
  blocks the transition). The reducer's TOUCH case is deleted and
  `touch` leaves `STEPS_WITH_APPLY_COMPLETION`. `setTouchDraft` /
  `deleteTouchKey` stay as the overlay's edit-time writes
  (D-090-31); `touchDraft` remains the gallery's persisted draft —
  applied view, not value (data-model).
  *Shared completion effects:* both re-homed effect sets must fire
  on BOTH completion paths — the StepHost adapter path and
  journey-runner's direct replay (it bypasses the adapters:
  journey-runner.ts:766-770, :795-803) — so they are factored as
  plain store-driven functions in the adapters' layer, called by
  the adapters after recording and by journey-runner in place of
  its `applyStepCompletion` calls for these two steps. ReducerDeps
  members that serve only R1/R2 (`lockDesktop`,
  `buildTouchLayoutJson`, `resolveBaseTouchJson`, `getStaleSteps`)
  are retired from the deps type and both constructions if no
  other case consumes them.
  **Flag 1 (lead ruling requested at T043):** T043's three actions
  (`recordAssignments`, `setTouchDraft`, `deleteTouchKey`) all
  remain the sanctioned edit-time write paths under this shape —
  registering FR-003 bans over the assignLoop trees would red the
  audit against the ratified design, the identical species as
  US3's six actions, whose non-registration was LEAD-RULED
  (D-090-31 → D-090-34). No ruling yet names US4's three; T043 is
  therefore executed as analysis + stop, and proceeds only on the
  lead's word (registration, or non-registration as a scope
  determination recorded at both FR-003 sites).
  **Flag 2 (expected T045 gate adjudication, not drift):** moving
  R1/R2 from mock-dep reducer calls to real adapter-completion
  effects means the golden-walk harness (real adapters over mocked
  galleries) will fire real `desktopLocked` / `touchLayoutJson`
  store writes at mechanisms/touch where the mocks previously
  absorbed them — fixture signature deltas at exactly those steps
  are the D-090-36 family (an intended migration signature), to be
  adjudicated at the gate, neither pre-regenerated nor treated as
  regression without a diff read.
- **D-090-39 — T041 landed: physical-layout module migrated under
  the D-090-38 shape; golden-walk fixture delta adjudicated
  INTENDED (the Flag-2 signature, arriving one task early).**
  Value home `survey/assignLoop/physicalLayoutValue.ts` (value =
  `{ assignments }` from `selectDesktopAssignments(phaseResults)` —
  the gallery's own selector, so the recorded value is the set the
  author saw); renderer `PhysicalLayoutDecisionRenderer` mirrors
  AddPhysicalAdapter's reads; the adapter records
  `{physical-layout, provenance: "asked"}` and fires
  `applyPhysicalCompletionEffects()` (new `lib/assignLoopCompletion
  .ts`: `lockDesktop()` + staleness-gated `repropagate`, the retired
  R1 verbatim) before `onComplete`. Reducer MECHANISMS case
  deleted; `mechanisms` left `STEPS_WITH_APPLY_COMPLETION`;
  journey-runner's mechanisms case re-pointed at the shared
  effects; ReducerDeps `lockDesktop` + `getStaleSteps` retired
  (type, StudioShell, journey-runner, and three test constructions;
  `getWorkingIR`/`setWorkingIR` stay — `applyDecisionEffects`'
  ctx uses them). Two completion simulations re-pointed at the
  real effects (walkEmit.compile, MechanismGallery.progression
  T008 — the latter now exercises the real repropagate too).
  **Fixture adjudication (read, not assumed):** both tracks delta
  ONLY at the mechanisms step — `applyStepCompletion
  ["mechanisms"] → []`, `decisionMutations [] → ["record"]`,
  interleaved `storeMutations` gains the same single `record`;
  `workingCopyMutations ["lockDesktop"]` UNCHANGED in both, now
  fired by the adapter's effects instead of the reducer. A
  store-level probe verified exactly one `physical-layout` record
  per walk, from the adapter. Fixtures regenerated through the
  harness's own write path; walk green 2/2 against them, plus a
  confirmation run. Gates: tsc 0; module/consistency/reducer/
  registry 45/45; progression 37/37; walkEmit 4/4; StepHost +
  applyDecisionEffects ×2 + deepLinkRevision + walk 30/30;
  recorder suites 15/15; eslint 0 errors (4 pre-existing
  StudioShell warnings, untouched lines).

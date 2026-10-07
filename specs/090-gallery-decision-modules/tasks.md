# Tasks: Gallery Decision Modules (specs/090-gallery-decision-modules)

**Input**: Design documents from `specs/090-gallery-decision-modules/`
(spec.md, plan.md, research.md, data-model.md)

**Prerequisites**: 088 landed on this stacked branch (live `decisionStore`, decision-id-keyed
log, `DecisionProvenance` with `"derived"`) and 089 landed (`apply` on `QuestionModule`, the
single patch runner, the golden walk + captured `main` baseline of 089 SC-001).

**Organization**: one phase per user story, in spec priority order. Each story phase is an
**independently landable PR slice** targeting this spec's branch, and each ends with the same
gate task (research R7): the golden walk byte-identical, the StepHost golden-walk parity test
green, package suites + `tsc` + lint green. A story whose gate is not green does not land.
`[P]` marks tasks in a phase that touch different files with no incomplete dependencies
between them.

**No hard stop remains in this list.** The carve per-item provenance choice point (T003) is
**RULED** (owner ruling 2026-10-06, km-lead proposals Q4 — Candidate A), and the renderer
literal in T004 is **RULED** (owner ruling 2026-10-06, km-lead proposals Q5 — rename to
`"question"`). T030/T032 proceed against the ruled shape when their turn comes.

## Format

`- [ ] T### [P?] [US?] Description with file path` — Setup and Foundational tasks carry no
story label; story-phase tasks carry theirs; Polish carries none.

---

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Verify the predecessor state on `km/gallery-decision-modules`: 088's
  `decisionStore` and decision-keyed draft slice, 089's `apply`/runner and the golden-walk
  script + `main` baseline all exist at the locations plan.md names; record any drift in a
  short addendum to specs/090-gallery-decision-modules/research.md. **Stop if the golden
  walk does not exist** — it is not re-invented inside 090 (research R7)
- [x] T002 Create the gallery module group skeleton (empty group, registered, no providers
  yet) in packages/studio/src/survey/questions/gallery/ and
  packages/studio/src/survey/questions/registry.ts

**Checkpoint**: the branch's predecessor machinery is confirmed real, and the registry has a
gallery group ready to receive modules.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the shared contract every story builds on — renderer props, the gallery host,
the FR-003 enforcement layers, the FR-002 coverage test, the SC-005 determinism harness, and
the recording of the owner's carve ruling (T003, resolved).

- [x] T003 **RULED (owner ruling 2026-10-06, km-lead proposals Q4)** — the carve removal-item
  provenance choice point is resolved: **Candidate A**, flat per-item
  `{ provenance: asked | derived | extracted }` for the removal-set items (Candidate B,
  mirroring spec 014's per-item agency object, is rejected); `carveDispositions`' existing
  spec-076 provenance rides unchanged. The ruling is recorded in
  specs/090-gallery-decision-modules/research.md (R8) and
  specs/090-gallery-decision-modules/data-model.md (removal-item shape marked RULED).
  T030/T032 proceed against this shape when their turn comes — no stop gate remains
- [x] T004 FR-001 contract: `DecisionRendererProps` gains `provenance` and `source`; the
  `QuestionModule.renderer` literal `"default"` becomes `"question"` per the spec's wording
  (research R3/Q2 — RULED: rename per FR-001, owner ruling 2026-10-06, km-lead proposals
  Q5; the keep-`"default"` alternative is rejected under the ruling) in
  packages/studio/src/decisions/decisionTypes.ts and packages/studio/src/survey/types.ts,
  with the question-module snapshot updated in
  packages/studio/src/survey/questions/__snapshots__/questionModules.test.ts.snap
- [x] T005 Gallery host: render a module's `renderer` with the `decisionStore` value for its
  decision; `onChange` records the decision and runs the module's `apply` through 089's
  runner — the first runtime reader of `module.renderer` — in
  packages/studio/src/steps/galleryHost.tsx, wired into the manifest/StepHost path in
  packages/studio/src/steps/manifest.ts (per-step adapters retire per story, not here)
- [x] T006 [P] FR-003 layer 1 (research R4): depcruise forbidden rule — gallery module and
  `apply` files may not import any store under `stores/` — in .dependency-cruiser.cjs;
  `pnpm depcruise` green
- [x] T007 [P] FR-003 layer 2 scaffolding (research R4): ESLint restricted-call-site overlay
  for renderer component trees plus the call-site checker test with an initially empty
  per-tree identifier list (each story extends it in its own change) in eslint.config.mjs and
  packages/studio/src/decisions/galleryWriteAudit.test.ts
- [x] T008 FR-002 coverage test: all fourteen `settles` ids from
  packages/studio/src/steps/stepDependencies.ts have exactly one registered provider module
  declaring `provides` / `requires` / `apply` / `renderer`, and each module's `requires`
  equals its step's declared `requires` (the parity 091 will rely on) in
  packages/studio/src/decisions/galleryModules.coverage.test.ts (module stubs land with this
  task; their renderers/applies fill in per story)
- [x] T009 SC-005 determinism harness: a frozen-stores test utility that runs an `apply`
  against a fixed (IR, value, inputs) and fails if any store is read or written, for reuse by
  every story's apply tests, in packages/studio/src/decisions/applyDeterminism.ts (with its
  own test in packages/studio/src/decisions/applyDeterminism.test.ts)

**Checkpoint**: the contract, host, enforcement, and coverage scaffolding exist; the fourteen
module stubs are registered and parity-pinned; stories can migrate components onto them.

---

## Phase 3: User Story 1 — Small pickers (Priority: P1) 🎯 MVP

**Goal**: `layout`, `touch_seed_source`, `choose_base` become modules; their renderers report
through `onChange` instead of writing `surveyAnswerStore` / session setters.

**Independent Test**: in `pnpm dev`, pick a Windows layout, a touch seed source, and a
starting point; each value is in `decisionStore` under its decision id, the draft restores it
on reload, and routing that reads it (touch seed asked once, per 088) behaves as before.

**PR slice**: this phase is one PR.

- [x] T010 [US1] Re-verify research R1's rows for `layout`, `touch_seed_source`, `choose_base`
  against the landed 088/089 code (088 already removed the `touchSeedSource` session field —
  research R6 note); amend the table in specs/090-gallery-decision-modules/research.md if any
  row drifted
- [x] T011 [P] [US1] `windows-layout` module: module + `WindowsLayoutValue` + selector-based
  readers in packages/studio/src/survey/questions/gallery/windowsLayout.ts;
  `LayoutStep` becomes the renderer and reports through `onChange` in
  packages/studio/src/survey/layout/LayoutStep.tsx; the `savePickedWindowsLayout` write path
  is deleted from packages/studio/src/lib/layoutFamily.ts (its read helpers re-point to the
  decision selector)
- [x] T012 [P] [US1] `touch-seed-source` module: module with its asked-while-unrecorded
  `gatedBy` preserved in packages/studio/src/survey/questions/gallery/touchSeedSource.ts;
  `TouchSeedSourcePanel` reports through `onChange` and loses its session write in
  packages/studio/src/editors/touchSeedSource/TouchSeedSourcePanel.tsx
- [x] T013 [US1] `base-keyboard` module: module in
  packages/studio/src/survey/questions/gallery/baseKeyboard.ts;
  `BaseResolutionAdapter` reports through `onChange` and stops calling `setLocalBase` /
  `setBaseConfirmed` in packages/studio/src/editors/adapters/panelAdapters.tsx; StudioShell's
  R3 working-copy setup reads the recorded decision (setup behaviour unchanged — setup as a
  decision's `apply` is 092) in packages/studio/src/StudioShell.tsx
- [x] T014 [US1] Extend the FR-003 identifier list with US1's write actions (`saveAnswer` for
  the layout step, `setLocalBase`, `setBaseConfirmed`, the touch-seed session write) in
  eslint.config.mjs and packages/studio/src/decisions/galleryWriteAudit.test.ts; audit green
  over the three migrated trees
- [x] T015 [US1] Tests: module contract + frozen-stores determinism for the three modules'
  `apply`s in packages/studio/src/survey/questions/gallery/windowsLayout.test.ts,
  packages/studio/src/survey/questions/gallery/touchSeedSource.test.ts, and
  packages/studio/src/survey/questions/gallery/baseKeyboard.test.ts
- [x] T016 [US1] **Gate + PR**: golden walk byte-identical; StepHost golden-walk parity green;
  studio suite, `tsc`, `pnpm lint` green; open the US1 PR with the gate results in its body

**Checkpoint**: the host, registry group, and both enforcement layers are proven end-to-end on
the three lowest-risk decisions.

---

## Phase 4: User Story 2 — The alphabet and inventories (Priority: P1)

**Goal**: `characters`, `marks`, `punctuation`, `invisibles`, `convenience` become modules;
`phaseBDraftStore`'s accept/decline becomes the inventory decisions' values; the MARKS and
context-tolerance IR rewrites move into `marks-treatment`'s `apply`.

**Independent Test**: walk Phase B/C in `pnpm dev` — confirm an alphabet, treat marks, accept
and decline punctuation and invisibles, retain convenience characters; every value is a
decision, `phaseBDraftStore` no longer exists, and the keyboard source matches `main`.

**PR slice**: this phase is one PR.

- [x] T020 [US2] Re-verify research R1's rows for `characters`, `marks`, `punctuation`,
  `invisibles`, `convenience` against the landed code (including every `saveAnswer` id
  `MarksSeriesStep` writes — research R1's composite warning); amend
  specs/090-gallery-decision-modules/research.md if any row drifted
- [x] T021 [US2] `character-inventory` module: value mapped field-for-field from the characters
  slice of `PhaseBDraftState` (data-model.md) in
  packages/studio/src/survey/questions/gallery/characterInventory.ts; `CharactersStep` becomes
  the renderer reporting through `onChange` in packages/studio/src/survey/CharactersStep.tsx;
  the spike module is retired into this one — its `extract` folded in, the module file and the
  now-unused spike renderer deleted — in packages/studio/src/survey/questions/b/pb_character_inventory.ts,
  packages/studio/src/survey/characters/InventoryRenderer.tsx, and
  packages/studio/src/test/sc004Harness.ts
- [x] T022 [P] [US2] `punctuation-inventory` + `invisibles-inventory` modules with
  `InventoryDecisionValue` (per-item provenance, FR-006) in
  packages/studio/src/survey/questions/gallery/punctuationInventory.ts and
  packages/studio/src/survey/questions/gallery/invisiblesInventory.ts; the components report
  accept/decline as value edits through `onChange` in
  packages/studio/src/survey/punctuation/PunctuationStep.tsx and
  packages/studio/src/survey/invisibles/InvisiblesStep.tsx
- [x] T023 [US2] `marks-treatment` module: the composite value of data-model.md in
  packages/studio/src/survey/questions/gallery/marksTreatment.ts; `MarksSeriesStep` and
  `ContextToleranceStation` report through `onChange` in
  packages/studio/src/survey/marks/MarksSeriesStep.tsx and
  packages/studio/src/survey/marks/ContextToleranceStation.tsx; `apply` performs
  `applyMarkGuards` and the context-tolerance patch, and the reducer's MARKS handler is
  retired in packages/studio/src/steps/reducer.ts
- [x] T024 [P] [US2] `retained-convenience-chars` module in
  packages/studio/src/survey/questions/gallery/retainedConvenienceChars.ts;
  `ConvenienceCharsStep` reports through `onChange` in
  packages/studio/src/survey/convenience/ConvenienceCharsStep.tsx; the
  `workingCopyStore.session.retainedConvenienceChars` mirror becomes an applied view written
  by `apply` (carve's read is unchanged) in packages/studio/src/stores/workingCopyStore.ts
- [x] T025 [US2] Delete `phaseBDraftStore`: store file and its draft slice in
  packages/studio/src/stores/phaseBDraftStore.ts, packages/studio/src/lib/draftTypes.ts, and
  packages/studio/src/lib/draftPersistence.ts — a saved v2 draft that still carries a
  `phaseBDraft` slice (written between 088 landing and this change) migrates its
  accept/decline state into the inventory decision values on load, with unmappable entries
  surfaced, never dropped (087 Q5 precedent)
- [ ] T026 [US2] Narrow `surveyAnswerStore` to within-step view position: the gallery answers
  migrated by US1 + this phase leave the store (zero gallery answer ids remain), and the
  store's header documents the narrowed role (research Q4 — name kept) in
  packages/studio/src/stores/surveyAnswerStore.ts
- [x] T027 [US2] FR-003 identifier list extended with the Phase B/C write actions (phaseBDraft
  accept/decline actions, the marks `saveAnswer` ids, the characters addition write) in
  eslint.config.mjs and packages/studio/src/decisions/galleryWriteAudit.test.ts; SC-004 grep
  recorded: zero references to `phaseBDraftStore`
- [x] T028 [US2] Tests: contract + determinism for the five modules (the marks `apply`
  determinism case covers both the guards and the context-tolerance patch) in
  packages/studio/src/survey/questions/gallery/characterInventory.test.ts,
  packages/studio/src/survey/questions/gallery/marksTreatment.test.ts,
  packages/studio/src/survey/questions/gallery/punctuationInventory.test.ts,
  packages/studio/src/survey/questions/gallery/invisiblesInventory.test.ts, and
  packages/studio/src/survey/questions/gallery/retainedConvenienceChars.test.ts; plus a
  reload test: a draft saved mid-Phase-B restores the inventory values from the `decisions`
  slice in packages/studio/src/lib/draftPersistence.test.ts
- [ ] T029 [US2] **Gate + PR**: golden walk byte-identical; StepHost golden-walk parity green;
  studio suite, `tsc`, `pnpm lint` green; open the US2 PR with the gate results and the
  SC-004 grep in its body

**Checkpoint**: Phase B/C answers exist only as decisions; one store is deleted, one is
narrowed; the largest composite value (marks) is proven deterministic.

---

## Phase 5: User Story 3 — Carve, deadkeys and rules (Priority: P2)

**Goal**: `carved-layout`'s value is the removal set with per-item provenance,
`deadkeys-defined`'s value is the deadkey op list, and `rule-set` records the builder's
result so the rules step leaves a decision.

**Independent Test**: carve a layout (hand removals plus accepted proposals), define
deadkeys, build rules in `pnpm dev`; all three values sit in `decisionStore`, the overlays
show only what `apply` wrote, and an orphaned hand removal is still shown.

**PR slice**: this phase is one PR.

- [ ] T030 [US3] Set the `CarveRemovalItem` shape in
  packages/studio/src/survey/questions/gallery/carvedLayout.ts to the ruled shape —
  Candidate A, flat per-item `{ provenance: asked | derived | extracted }` (owner ruling
  2026-10-06, km-lead proposals Q4; recorded in research R8 / data-model.md) — before any
  carve value code is written
- [ ] T031 [US3] Re-verify research R1's rows for `carve`, `deadkeys`, `rules` against the
  landed code; amend specs/090-gallery-decision-modules/research.md if any row drifted
- [ ] T032 [US3] `carved-layout` module: value = removal items (ruled shape) + `dispositions`
  (the contracts `CarveDisposition`, unchanged) + `closedKeyboardCard` in
  packages/studio/src/survey/questions/gallery/carvedLayout.ts; `CarveGalleryV2` keeps its
  live overlay as renderer-internal draft for the OSK preview and commits through `onChange`
  in packages/studio/src/editors/carve/CarveGalleryV2.tsx; `apply` writes the overlay
  applied view through the existing carve pipeline in
  packages/studio/src/lib/projectWorkingCopyVfs.ts; `undoStack` is re-pointed to operate on
  the decision value (research R5) in packages/studio/src/stores/workingCopyStore.ts
- [ ] T033 [P] [US3] `deadkeys-defined` module: value = the op list in
  packages/studio/src/survey/questions/gallery/deadkeysDefined.ts; the deadkey editors record
  ops through the host instead of calling `commitDeadkeyOp` in
  packages/studio/src/editors/deadkey/DeadkeySurface.tsx (and its sibling editors);
  `apply` replays the ops through the existing patch construction in
  packages/studio/src/editors/deadkey/deadkeyWrite.ts
- [ ] T034 [P] [US3] `rule-set` module: the serializable builder-result shape defined from the
  builder's own types, and the module, in
  packages/studio/src/survey/questions/gallery/ruleSet.ts; `RulesStep` reports the value
  through `onChange` instead of `onComplete(undefined)` in
  packages/studio/src/survey/rules/RulesStep.tsx
- [ ] T035 [US3] FR-003 identifier list extended with the carve/deadkey write actions
  (`cascadeDelete`, `cascadeRestore`, `restoreAll`, `keepAll`, `prefillCarveDispositions`,
  `commitDeadkeyOp`) in eslint.config.mjs and
  packages/studio/src/decisions/galleryWriteAudit.test.ts; audit green over the migrated
  trees
- [ ] T036 [US3] Tests: contract + determinism for the three `apply`s in
  packages/studio/src/survey/questions/gallery/carvedLayout.test.ts,
  packages/studio/src/survey/questions/gallery/deadkeysDefined.test.ts, and
  packages/studio/src/survey/questions/gallery/ruleSet.test.ts; an orphaned hand-set removal
  item is kept in the value and shown (spec edge case) and a proposal refresh keeps hand
  removals, both in packages/studio/src/survey/questions/gallery/carvedLayout.test.ts
- [ ] T037 [US3] **Gate + PR**: golden walk byte-identical; StepHost golden-walk parity green;
  studio suite, `tsc`, `pnpm lint` green; open the US3 PR with the gate results and the
  recorded T003 ruling cited in its body

**Checkpoint**: the three hardest galleries are decision values; carve's provenance is the
owner-ruled shape, and deadkeys reuse their existing mutate path as an `apply`.

---

## Phase 6: User Story 4 — Mechanisms and touch (Priority: P2)

**Goal**: `physical-layout`'s value is the assignments (R1 `lockDesktop` moves into its
`apply`); `touch-layout`'s value is the key-edit ops plus deletions with spec 014 per-key
provenance (R2 `setTouchLayoutJson` moves into its `apply`).

**Independent Test**: assign physical keys and edit touch keys in `pnpm dev`; suggested
assignments/keys refresh as they do today, hand-set ones survive, and both values sit in
`decisionStore` with the reducer's R1/R2 hooks gone.

**PR slice**: this phase is one PR.

- [ ] T040 [US4] Re-verify research R1's rows for `mechanisms` and `touch` against the landed
  code; amend specs/090-gallery-decision-modules/research.md if any row drifted
- [ ] T041 [US4] `physical-layout` module: value = the assignment list (each assignment keeps
  the provenance it already carries) in
  packages/studio/src/survey/questions/gallery/physicalLayout.ts; `MechanismGallery` reports
  through `onChange` instead of `recordAssignments` in
  packages/studio/src/editors/assignLoop/MechanismGallery.tsx; `apply` performs the R1
  `lockDesktop` effect and the reducer's R1 hook is retired in
  packages/studio/src/steps/reducer.ts; `repropagate` refresh behaviour (suggested refresh,
  hand-set survive) is preserved against the value
- [ ] T042 [US4] `touch-layout` module: value = key-edit ops + `deletedTouchKeyIds`, per-key
  provenance in spec 014's vocabulary unchanged, in
  packages/studio/src/survey/questions/gallery/touchLayout.ts; `TouchGallery` reports through
  `onChange` instead of `setTouchDraft` / `deleteTouchKey` in
  packages/studio/src/editors/assignLoop/TouchGallery.tsx; `apply` performs the R2
  `buildTouchLayoutJson` + `setTouchLayoutJson` work and the reducer's R2 hook is retired in
  packages/studio/src/steps/reducer.ts
- [ ] T043 [US4] FR-003 identifier list extended with `recordAssignments`, `setTouchDraft`,
  `deleteTouchKey` in eslint.config.mjs and
  packages/studio/src/decisions/galleryWriteAudit.test.ts; audit green over the assignLoop
  trees
- [ ] T044 [US4] Tests: contract + determinism for both `apply`s (R1 lock effect, R2 JSON
  build) in packages/studio/src/survey/questions/gallery/physicalLayout.test.ts and
  packages/studio/src/survey/questions/gallery/touchLayout.test.ts; a store-level scenario in
  packages/studio/src/survey/questions/gallery/touchLayout.test.ts: suggested keys refresh on
  an input change, hand-set keys survive, an orphaned hand-set key is kept and shown
  (spec 014 R6)
- [ ] T045 [US4] **Gate + PR**: golden walk byte-identical; StepHost golden-walk parity green;
  studio suite, `tsc`, `pnpm lint` green; open the US4 PR with the gate results in its body

**Checkpoint**: both assign-loop galleries are modules; the reducer no longer owns any
gallery's IR rewrite.

---

## Phase 6b: Tail — `phaseAnswersByStep` deletion (after US4)

**Why here (owner ruling 2026-10-06, km-lead proposals Q8):** 090 owns this deletion.
The field's residue after 088 is gallery answers, which become decision values in this
spec. 088's T016/T017 were stopped on a falsified premise (`mergePhaseResults` never
reads `.answers`; the slots hold predominantly gallery answers with no decision record
until 090), and 088's duplication ledger is corrected to "retired by 090." Sequencing
is the whole risk: this task runs **only after US4 completes** — deleting earlier breaks
spec-079 D-4 per-step replacement for galleries not yet converted. (Waiting is not
neutral either: 093's replay input is decisions only, so a fact held solely in this
field would be invisible to replay and silently vanish when the derived-keyboard draft
drops the working-copy slice.)

- [ ] T063 Delete `phaseAnswersByStep` from packages/studio/src/stores/workingCopyStore.ts,
  coupled to `recordPhase` ceasing to carry answers (its answer-carrying writes retire with
  the US1–US4 migrations); strip-on-restore for the stale field in pre-090 snapshots: a
  persisted working-copy snapshot that still carries `phaseAnswersByStep` has the field
  dropped on restore in packages/studio/src/lib/persistWorkingCopy.ts and never re-saved;
  closing grep recorded: zero references to `phaseAnswersByStep` in packages/studio/src

**Checkpoint**: no answer state remains outside decision records — the working copy holds
only the applied view the decisions produce (until 093 drops the saved slice entirely).

---

## Phase 7: User Story 5 — Every decision leaves a log entry (Priority: P2)

**Goal**: `layout`, `rules`, `touch_seed_source`, `deadkeys`, `punctuation` and `convenience`
— which today leave no decision-log entry (HANDOFF G7) — record one on completion, as does
every decision (FR-008), with exactly one entry per decision across all steps (SC-003).

**Independent Test**: a live walk over every step leaves exactly one decision-log entry per
settled decision, checked against the decision list — no gaps, no duplicates.

**PR slice**: this phase is one PR.

- [ ] T050 [US5] Decision-driven recording: the gallery host records exactly one log entry
  per settled decision on completion, through the decision-id-keyed recorder 088 established,
  in packages/studio/src/steps/galleryHost.tsx and
  packages/studio/src/decisions/createStudioDecisionRecorder.ts; answer-driven recording for
  migrated steps is removed so nothing double-records in packages/studio/src/steps/reducer.ts
- [ ] T051 [P] [US5] Close the named G7 gaps: entries verified present for `windows-layout`,
  `rule-set`, `touch-seed-source`, `deadkeys-defined`, `punctuation-inventory`,
  `retained-convenience-chars` in a store-level test through the real `StepHost` in
  packages/studio/src/decisions/galleryLogEntries.test.ts; the HANDOFF G7 starting-point
  entry (`recordBaseContribution` timing) is verified in the same walk — if it is still null
  after 088/089, record it in specs/090-gallery-decision-modules/followups.md rather than
  fixing it here (it belongs to the 088/092 boundary)
- [ ] T052 [P] [US5] `help-docs` gallery-host registration (research Q3 boundary): the
  `PhaseFGate` step is hosted so gate completion records the `help-docs` log entry, with no
  second write path beside 089's flow `apply`s, in
  packages/studio/src/survey/questions/gallery/helpDocs.ts and
  packages/studio/src/editors/adapters/PhaseFGate.tsx
- [ ] T053 [US5] SC-003 live-walk test: a Playwright walk in `pnpm dev` over every step,
  asserting exactly one log entry per decision for all fourteen gallery decisions and the
  question decisions, in packages/studio/tests/steps/galleryDecisionLog.walk.test.tsx (or the
  repo's Playwright e2e home, matching 089's golden-walk placement)
- [ ] T054 [US5] **Gate + PR**: golden walk byte-identical; StepHost golden-walk parity green;
  studio suite, `tsc`, `pnpm lint` green; open the US5 PR with the SC-003 walk results in its
  body

**Checkpoint**: the decision trail is complete — every decision the studio settles is in the
log exactly once.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T060 [P] SC-002 final audit: both FR-003 lint layers pass with **zero exceptions**
  across all renderer trees; the closing grep pack — zero `phaseBDraftStore` references
  (SC-004), zero gallery answer ids in `surveyAnswerStore`, zero in-place IR rewrites outside
  an `apply` — run and recorded in specs/090-gallery-decision-modules/plan.md's PR summary
  (and the final PR body)
- [ ] T061 [P] Duplication-ledger close-out: verify every row of the spec's ledger (gallery
  answers + `phaseBDraftStore` deleted; overlays are decision values with the working copy
  holding only an applied view; in-place rewrites deleted outside modules; `settles` strings
  redundant and parity-pinned for 091) and write any slip into
  specs/090-gallery-decision-modules/followups.md naming the later spec that retires it
- [ ] T062 Full gates and consistency: all package suites, `tsc`, the full `pnpm lint` chain,
  the golden walk, and the StepHost parity test green on the branch head; `/speckit-analyze`
  run over spec ↔ plan ↔ tasks with findings resolved or recorded; companion step marked
  completed

**Checkpoint**: spec 090's success criteria are each measured, not asserted — SC-001 per
story gate, SC-002 at T060, SC-003 at T053, SC-004 at T027/T060, SC-005 per story.

---

## Dependencies & Execution Order

- **Phase 1 → Phase 2** blocks everything: no story starts before the host, the registry
  group, the enforcement scaffolding, and the coverage test exist.
- **T003's ruling is recorded** (owner ruling 2026-10-06, km-lead proposals Q4 —
  Candidate A): nothing waits on it; T030/T032 use the ruled `CarveRemovalItem` shape.
- **T063 (`phaseAnswersByStep` deletion)** runs only **after US4 completes** (the T045
  gate green) — owner ruling 2026-10-06, km-lead proposals Q8. It blocks nothing else;
  US5 and Polish proceed independently of it.
- **US1 → US2 → US3 → US4 → US5** in spec order: US2's `surveyAnswerStore` narrowing (T026)
  joins US1's layout migration; US5's exactly-one-entry check (T053) is only meaningful after
  US1–US4 have moved recording to the decision path; US3's carve reads the inventory values
  US2 creates.
- Within a story, the re-verify task (T010 / T020 / T031 / T040) precedes its migrations;
  the gate task is always last and joins on everything in the phase.
- T021 (character inventory) precedes T022–T024: punctuation, invisibles and convenience all
  `require` `character-inventory`, and their modules register against its value shape.

## Parallel Opportunities

- Phase 2: T006 (depcruise) and T007 (ESLint/audit) are different files — parallel-safe.
  T003 is already ruled and recorded; nothing in Phase 2 waits on an owner conversation.
- US1: T011 (layout) and T012 (touch seed) are different components and module files —
  parallel-safe; T013 joins on the host patterns they prove.
- US2: T022 (punctuation/invisibles) and T024 (convenience) are parallel-safe once T021 lands.
- US3: T033 (deadkeys) and T034 (rules) are parallel-safe.
- US5: T051 (gap test) and T052 (help host) are parallel-safe.
- Polish: T060 and T061 are parallel-safe; T062 joins on everything.

## Implementation Strategy

- **MVP**: Phase 1 + Phase 2 + US1 — three small pickers prove the module shape, the host,
  and both enforcement layers on the lowest-risk components, behind a byte-identical golden
  walk.
- **Incremental delivery**: one PR per story phase, in order, each independently landable and
  each leaving the studio behaviourally identical (the only visible change in the whole spec
  is a complete decision log, which is the feature).
- **What is deliberately not here**: deleting `stepDependencies.ts` / `settles` (091),
  running `extract` live (092), replaying the working copy from decisions and dropping the
  applied view (093). 090's parity tests are written so those specs inherit them green.

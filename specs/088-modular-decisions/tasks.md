# Tasks: Decision store — one record per decision

**Input**: Design documents from `/specs/088-modular-decisions/`

**Prerequisites**: [plan.md](plan.md) (required), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/decision-store-contract.md](contracts/decision-store-contract.md), [quickstart.md](quickstart.md)

**Tests**: The spec's success criteria are test-shaped (SC-001 Playwright walk, SC-003
fixture accounting, SC-004 parity, SC-005 real-StepHost test), so test tasks are
included per story, written before/with the implementation they pin.

**Organization**: Tasks are grouped by user story. One commit per phase, pushed to the
stacked branch `km/decision-store` as the phase goes green (repo cadence, CLAUDE.md).

**Phase-order note (from plan.md)**: the draft *reader* and migration land in the
Foundational phase — before US1 flips the writer to v2 — so no build ever writes a
draft it cannot read back or migrate (plan Risk R-1). The story phases otherwise run
in priority order.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story label (US1–US4 from spec.md)
- Every task names its exact file path(s)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the green baseline and the one fixture SC-003 depends on.

- [x] T001 Confirm the baseline is green on `km/modular-decisions` before any change: run `decisions/orderParity.test.ts`, `decisions/gateWalkParity.test.ts`, `steps/manifest.test.ts`, `steps/advance.test.ts`, `steps/decisionsFromTraversal.test.ts`, `lib/draftPersistence.test.ts`, `decisions/decisionLogStore.test.ts` and `components/StepHost.test.tsx` via the studio package's vitest config and record the pass counts in the phase commit message
- [x] T002 Capture the v1 draft fixture from `main` @ 18e63aa4 (pre-088 code: check that commit out in a scratch worktree, drive the live save path with identity + track + project_name answered on the copy track, export the resulting `DurableDraft`) into `packages/studio/src/lib/__fixtures__/v1-draft-18e63aa4.json`, following the `lib/__fixtures__/pre079-draft.json` precedent; the fixture MUST have `version: 1` and MUST NOT be hand-edited after capture

**Checkpoint**: Baseline green; fixture captured and committed.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The record type, the store, and the draft reader/migration that every
story writes through or loads through.

**⚠️ CRITICAL**: No user story work begins until this phase is complete. T017 (the v2
writer flip, US1) additionally requires T008–T010 green.

- [x] T003 Extend the record type in `packages/studio/src/decisions/decisionTypes.ts`: add `"derived"` to the studio-local `DecisionProvenance` (FR-002 — declared here, written by no 088 path) and add `inputs?`, `offered?`, `step?` to `Decision` per [data-model.md](data-model.md) §1 (FR-001), setting optional fields only when present (`exactOptionalPropertyTypes`)
- [x] T004 Create the decision store in `packages/studio/src/stores/decisionStore.ts`: `useDecisionStore` with `record` / `recordAll` / `reset`, plus `getDecisionSnapshot` / `applyDecisionSnapshot` / `peekDecision` and the `selectTrack` / `selectTouchSeedSource` selectors, per contract C-1 (no imports from other stores, steps, or survey modules)
- [x] T005 [P] Write the store contract tests in `packages/studio/src/stores/decisionStore.test.ts`: replace-by-id, snapshot→apply round-trip identity (C-1.4), a record carrying `provenance: "derived"` round-trips intact, `reset()` empties the set
- [x] T006 Inventory every `recordPhase` caller and every reader of `phaseResults[].answers` / `phaseAnswersByStep` across `packages/studio/src` and append the inventory to `specs/088-modular-decisions/research.md` (new §4) — T015/T016 are written against this inventory (plan Risk R-2)
- [x] T007 Add the optional `decisions` slice to `DurableDraft` in `packages/studio/src/lib/draftTypes.ts` (type only; `DRAFT_VERSION` does not change in this task)
- [x] T008 Implement `migrateDraftEnvelope` in `packages/studio/src/lib/draftPersistence.ts` as a pure function per [data-model.md](data-model.md) §5: v1 `surveyAnswers` answers map to records through `questionRegistry[qid].provides`; `traversal.selectedTrack` / `touchSeedSource` become `authoring-track` / `touch-seed-source` records (session field wins a disagreement, mismatch logged to console — contract C-4.4); unresolvable answers are collected into `migrationOrphans`, never dropped (C-4.3)
- [x] T009 Write migration unit tests in `packages/studio/src/lib/draftPersistence.test.ts` against the T002 fixture: identity/track/project_name answers become records under `language-code`, `copyright-holder`, `authoring-track`, `project-display-name`, `project-keyboard-id` with the fixture's values and `step` set from the v1 step keys
- [x] T010 Rewire every version gate and the boot key scan in `packages/studio/src/lib/draftPersistence.ts` to run `migrateDraftEnvelope` before the `version !== DRAFT_VERSION` checks, and make the boot scan also find envelopes under the `.v1` key suffix (contract C-4.2); native v1 loading behaviour is unchanged until T017 flips the writer

**Checkpoint**: Foundation ready — store exists and is contract-tested; a v1 envelope
can be migrated and loaded by the reader; nothing yet writes v2 or reads the store.

---

## Phase 3: User Story 1 — Answers survive a reload under their decision id (Priority: P1) 🎯 MVP

**Goal**: Every survey-question completion writes one record per provided decision
into `decisionStore`, and drafts persist answers only there.

**Independent Test**: Walk identity, track, project_name in `pnpm dev`, reload —
answers restored; the saved draft holds them only in `decisions` (SC-001).

### Tests for User Story 1

- [x] T011 [P] [US1] Write writer tests in `packages/studio/src/steps/reducer.decisionStore.test.ts`: one record per `provides` id with the answer's value; provenance mapping per research D-05 (no proposal → `asked`; proposal accepted + source `base` → `extracted`; proposal accepted otherwise → `default`; proposal overridden → `asked` with `offered` = the proposal value); `inputs` snapshots the store's current values for the module's `requires`; a synthetic multi-provide module broadcasts its value to each provided id (research §1b)
- [x] T012 [P] [US1] Write the StepHost reload test in `packages/studio/src/components/StepHost.test.tsx`: drive the real `StepHost` through an identity completion, snapshot the draft slices, re-apply them into fresh stores, and assert the answers are restored from `decisions` with value and provenance intact

### Implementation for User Story 1

- [x] T013 [US1] Implement `recordAnswersAsDecisions(result, stepId)` in `packages/studio/src/steps/reducer.ts` beside `routeAnswersThroughMutate`, per contract C-2 (registry lookup per answer, broadcast per provided id, synchronous, no timer)
- [x] T014 [US1] Call `recordAnswersAsDecisions` from `handleComplete` in `packages/studio/src/components/StepHost.tsx`, in the same block as `recordPhase` / `routeAnswersThroughMutate`
- [x] T015 [US1] Stop persisting survey-question answers in `packages/studio/src/lib/draftPersistence.ts`: the writer's `surveyAnswers` slice is filtered to within-step position, step status, and gallery-step answers (090's to retire); the reader tolerates both shapes (FR-006)
- [ ] T016 [US1] ~~Delete `phaseAnswersByStep` from `packages/studio/src/stores/workingCopyStore.ts`~~ — **STOPPED BY OWNER RULING (2026-10-06, km-lead proposals Q8, adopted by Matthew; ~/workspace/keyboard-studio-notes/modular-decisions-proposals.md)**: premise falsified by the T006 inventory (research.md §4 — `mergePhaseResults` never reads `.answers`; live `phaseResults[].answers` are predominantly gallery/phase answers with non-registry ids that become decisions only in spec 090, so no decision-derived replacement exists in 088). `phaseAnswersByStep` is **retired by spec 090** as a tail task after its US4, not deleted by 088. FR-006's 088 scope is: question answers leave the survey-answer store and the v2 draft slice (T015/T018); `phaseAnswersByStep` carries 090 as its named retirement owner.
- [ ] T017 [US1] ~~Add the derived `selectPhaseAnswers(decisions, phase)` selector and re-point the `mergePhaseResults` session derivation and every T006-inventoried answer reader to it~~ — **STOPPED BY OWNER RULING (2026-10-06, km-lead proposals Q8)**, same disposition as T016: no decision-derived replacement for phase answers can exist until spec 090 turns gallery/phase answers into decisions; the re-pointing belongs to 090 alongside the `phaseAnswersByStep` retirement.
- [x] T018 [US1] Flip the draft writer to v2 in `packages/studio/src/lib/draftPersistence.ts`: `DRAFT_VERSION` 1 → 2, envelope gains `decisions: getDecisionSnapshot()`, the apply path restores the store via `applyDecisionSnapshot`, and `reset()` of the decision store is wired into the same start-over / new-project paths that reset `surveyAnswerStore` (FR-007) — gated on T008–T010 green
- [x] T019 [US1] Write the SC-001 Playwright walk in `packages/studio/e2e/decision-store-reload.spec.ts` per [quickstart.md](quickstart.md): answer identity, track, project_name in `pnpm dev`, reload, assert restoration, then assert the saved localStorage draft (`ks.draft.<key>.v2`) holds the answers only in its `decisions` slice — **evidence note (2026-10-06)**: the spec file is written as specified, but the live walk cannot execute in the implementation sandbox: Chromium 152 (/opt/meta-chromium) refuses every localhost navigation with `net::ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS` (tried `localhost` and `127.0.0.1`, with `--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessChecks,BlockInsecurePrivateNetworkRequests`). SC-001 therefore rests on the T012 store-level evidence through the real StepHost (writer → snapshot → fresh stores → rehydrated answers, value + provenance asserted). The Playwright spec remains the live-app gate wherever a browser that permits localhost is available.

**Checkpoint**: US1 fully functional — completions write decision records, drafts are
v2 with answers only in `decisions`, reload restores them. (US2 is not required for
this checkpoint: routing still reads the session fields, which the adapters still
set; the records and the fields agree because both are written from the same
completions.)

---

## Phase 4: User Story 2 — One store drives routing (Priority: P1)

**Goal**: `gatedBy` reads `decisionStore` only; the rebuilt set and the two session
copies are deleted.

**Independent Test**: With `decisionsFromTraversal` deleted, the gate tests and the
live walk still route `project_name` (copy only) and `touch_seed_source` (asked
once) correctly.

- [x] T020 [P] [US2] Add routing tests to `packages/studio/src/steps/advance.test.ts` (fixture construction only — `advance()`'s logic is untouched): adapt track skips `project_name` when the context is fed from a `DecisionSet` with `authoring-track: adapt`; a recorded `touch-seed-source` skips the seed step; no record asks it
- [x] T021 [US2] Feed `advance()` from the decision store at its call sites: `packages/studio/src/components/StepHost.tsx` (post-completion state read) and `packages/studio/src/components/StudioFooter.tsx`, keeping the `AdvanceContext` field names and shapes (`selectedTrack`, `touchSeedSource` become reads of the store snapshot)
- [x] T022 [US2] Re-point `packages/studio/src/lib/resolveLocation.ts` to evaluate `gatedBy` over the store snapshot with the `touch-seed-source` record omitted (the C-3.2 view — never stored, never rebuilt from session fields)
- [x] T023 [US2] Delete `packages/studio/src/steps/decisionsFromTraversal.ts` and `packages/studio/src/steps/decisionsFromTraversal.test.ts` (FR-004); zero source references remain (SC-002 partial)
- [x] T024 [US2] Remove `selectedTrack` and `touchSeedSource`, their setters, and their `snapshotTraversal` / restore members from `packages/studio/src/stores/surveySessionStore.ts`, updating `packages/studio/src/stores/surveySessionStore.test.ts` for the slimmer snapshot (FR-005)
- [x] T025 [US2] Re-point the remaining readers to the decision-store selectors: `packages/studio/src/StudioShell.tsx` (instantiation read), `packages/studio/src/editors/assignLoop/TouchGallery.tsx`, `packages/studio/src/editors/adapters/addTouchAdapter.tsx`, and `packages/studio/src/editors/touchSeedSource/TouchSeedSourcePanel.tsx` (which now records the `touch-seed-source` decision instead of calling the deleted setter)
- [x] T026 [US2] Re-home the touch-draft side effect (research D-06): where the seed decision is recorded or changed — `packages/studio/src/editors/touchSeedSource/TouchSeedSourcePanel.tsx` and the touch cases in `packages/studio/src/steps/reducer.ts` — explicitly clear the working copy's touch draft, and remove the `setTouchSeedSource` `ReducerDeps` injection

**Checkpoint**: US1 + US2 both work; routing reads one store; SC-002's grep for
`decisionsFromTraversal` and for the session fields in `surveySessionStore.ts` is
clean; `gateWalkParity` still passes **unmodified**.

---

## Phase 5: User Story 3 — Old drafts migrate (Priority: P2)

**Goal**: A v1 draft loads with every answer present under its decision id, or
shown to the author — nothing dropped.

**Independent Test**: Load the T002 v1 fixture; 100% of its answers are records or
surfaced orphans (SC-003).

- [x] T027 [US3] Write the end-to-end migration test in `packages/studio/src/lib/draftPersistence.test.ts`: seed localStorage with the T002 fixture under its `.v1` key, run the real load path, assert the decision store holds the fixture's answers under their decision ids and the project opens (SC-003)
- [x] T028 [P] [US3] Write the orphan-accounting test in `packages/studio/src/lib/draftPersistence.test.ts`: a fixture variant whose answers include a question id absent from the registry produces exactly one `migrationOrphans` entry, and records + retained gallery answers + orphans = 100% of the variant's answers (C-4.3)
- [x] T029 [P] [US3] Write the disagreement test in `packages/studio/src/lib/draftPersistence.test.ts`: a v1 fixture variant whose `traversal.selectedTrack` disagrees with its log/session copy migrates with the session field's value winning and a console log emitted (no UI surface asserted)
- [x] T030 [US3] Surface `migrationOrphans` to the author on load — **UNBLOCKED BY OWNER RULING (2026-10-06, km-lead proposals Q1 / OPEN-088-1, adopted by Matthew; ~/workspace/keyboard-studio-notes/modular-decisions-proposals.md)**: the surface is the **decision trail**. On v1→v2 migration, each orphaned answer is written as a decision-log entry visible in the trail, carrying its value, following the trail's existing entry shapes and FR-035 degrade behaviour. No new surface, no notice-store machinery.

**Checkpoint**: SC-003 green (T027–T029). US3 is *complete* only when T030 lands —
088 must not be marked complete with orphans collected-but-unshown.

---

## Phase 6: User Story 4 — The decision log is keyed by decision (Priority: P2)

**Goal**: A decision's superseded history follows the decision, not the step that
asked it.

**Independent Test**: Answer a question twice, move it to another step in a test
registry, and the trail still shows both entries (plus SC-005).

- [ ] T031 [US4] Re-key survey-answer slots by decision id in `packages/studio/src/decisions/decisionLogStore.ts`: `slotKeyOf` resolves `payload.questionId` through the registry's `provides` and keys the slot by the decision id (keeping the `\u0000` delimiter and kind discriminator); an unresolvable question id falls back to the legacy step-based slot (contract C-5); `editor-action` and `base-contribution` slots are unchanged; `DecisionEntry.stepId` keeps being written as display metadata (FR-008)
- [ ] T032 [P] [US4] Update and extend `packages/studio/src/decisions/decisionLogStore.test.ts`: same decision recorded from two different steps supersedes into one slot; two different decisions on one step never supersede; a legacy-fallback entry keeps its history; a hydrated v1 record re-keys with no stored migration
- [ ] T033 [US4] Update any caller that precomputes or depends on the old slot shape — grep `slotKeyOf` across `packages/studio/src/decisions/` and `packages/studio/src/steps/`, and adjust `packages/studio/src/decisions/recordSurveyAnswers.ts` / `packages/studio/src/decisions/createStudioDecisionRecorder.ts` only where the grep shows a real dependency (the append path computes slots inside the store; expect few or no changes and say so in the commit message)
- [ ] T034 [US4] Write the SC-005 moved-question test in `packages/studio/src/components/StepHost.test.tsx`: a test registry places `il_copyright_holder` in a different step than production; drive the real `StepHost` to answer it twice, reload, and assert the current `copyright-holder` record survived the move and the trail shows both entries under the decision (also closes US1 AC2)

**Checkpoint**: All four stories functional; the log's history is per-decision.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Prove the spec's no-visible-change and completeness gates, unmodified.

- [ ] T035 Run the full verification set and record results in the phase commit message: `pnpm --filter @keyboard-studio/studio test`, `pnpm typecheck`, `pnpm lint` (includes depcruise — the C-1.3 import discipline and D-06 side-effect move are checked here)
- [ ] T036 Verify SC-004: `git diff` against the stacked branch's base shows `packages/studio/src/decisions/orderParity.test.ts`, `packages/studio/src/decisions/gateWalkParity.test.ts` and `packages/studio/src/steps/manifest.test.ts` byte-identical, and all three suites pass (FR-009); verify SC-002's full grep gate per [quickstart.md](quickstart.md)
- [ ] T037 [P] Re-run every command in [quickstart.md](quickstart.md) exactly as written and fix the guide where a command disagrees with reality (docs-only change to `specs/088-modular-decisions/quickstart.md`)
- [ ] T038 [P] Record the plan/tasks completion in `specs/088-modular-decisions/.spec-context.json` via the companion writer scripts (`write-context.py --step plan …` / `--step tasks …`) if the implementation crew runs attended; otherwise note its absence in the final commit message

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — starts immediately. T002's fixture gates T009/T027/T028.
- **Foundational (Phase 2)**: Depends on Setup. BLOCKS all user stories. T003 → T004 (store uses the extended type); T007 → T008 → T009/T010.
- **US1 (Phase 3)**: Depends on Foundational. T013 needs T004; T018 needs T008–T010 green (reader before writer, plan R-1).
- **US2 (Phase 4)**: Depends on US1's writer (records exist to route over) — specifically T013/T014. T024 needs T021/T022/T025's selectors in use first, or the tree won't compile between commits; order within the phase as listed.
- **US3 (Phase 5)**: Depends on Foundational (T008–T010) and US1's T018 (native v2 to compare against). T030 was unblocked by the owner's 2026-10-06 ruling on OPEN-088-1 (surface: the decision trail — see the T030 line).
- **US4 (Phase 6)**: Depends on US1 (records keyed by decision exist). Independent of US2/US3 code; may run before Phase 5 if staffed, except T034 reuses T012's StepHost harness additions.
- **Polish (Phase 7)**: Depends on all story phases.

### User Story Dependencies

- **US1 (P1)**: Foundation only. The MVP — shippable alone (routing still uses the session fields, which agree with the records).
- **US2 (P1)**: US1 (the store must be written before it can be read for routing).
- **US3 (P2)**: Foundational migration + US1's v2 writer. Orphan *surfacing* (T030) goes to the decision trail per the owner's 2026-10-06 OPEN-088-1 ruling.
- **US4 (P2)**: US1. Log re-keying is otherwise self-contained.

### Within Each User Story

- Tests are written in the same phase, before or beside the implementation they pin.
- Store/type changes before writers; writers before call-site re-pointing; deletions last in their phase.
- A phase's commit is pushed only when its checkpoint criteria pass.

### Parallel Opportunities

- T005 (store tests) runs parallel to T006/T007 once T004 lands.
- T011 and T012 (US1 tests) run in parallel.
- T020 (advance tests) runs parallel to T011/T012 — it is US2 work that only needs the Foundational phase, but its *implementation* tasks wait for US1.
- T028 and T029 run in parallel; T032 runs parallel to T033.
- T037 and T038 run in parallel at the end.

---

## Implementation Strategy

### MVP First (US1 Only)

1. Phases 1–2 (Setup + Foundational)
2. Phase 3 (US1): completions → decision records; drafts v2; reload restores
3. **STOP and VALIDATE**: quickstart SC-001 + SC-003 run green
4. This is a coherent landing on its own (the series handoff's "phase 1" made
   shippable): one live record exists and drafts use it; routing still reads the
   session fields it also writes.

### Incremental Delivery

1. Setup + Foundational → store, type, migration reader ready
2. US1 → answers live in the store; drafts v2 (MVP)
3. US2 → routing reads the store; duplicates deleted (SC-002)
4. US3 → v1 drafts migrate with full accounting (SC-003); orphans surface in the decision trail (OPEN-088-1, ruled 2026-10-06)
5. US4 → log per-decision (SC-005)
6. Polish → parity unmodified (SC-004), full suite/lint/typecheck green

### Notes

- [P] tasks = different files, no incomplete dependencies.
- FR-009 is a hard constraint throughout: `orderParity`, `gateWalkParity`, and
  `steps/manifest` test files are never edited by any task above.
- No task touches `packages/contracts`, adds a timer, or changes an i18n id (FR-010).
- OPEN-088-1 (plan.md) was ruled by the owner on 2026-10-06 (km-lead proposals Q1): orphaned v1 answers surface in the decision trail; T030 implements it. Q8 of the same ruling stops T016/T017: `phaseAnswersByStep` is retired by spec 090, not deleted by 088.

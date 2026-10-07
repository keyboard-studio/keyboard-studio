# Tasks: The keyboard is derived from decisions

**Input**: Design documents from `/specs/093-derived-keyboard/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md

**Tests**: The spec's success criteria are test-shaped (Playwright walks in `pnpm dev`,
store-level tests through the real `StepHost`, a determinism property test), so test tasks are
included, written before the implementation they pin.

**Organization**: Tasks are grouped by user story. Two owner decisions are open (plan.md,
"Open owner decisions"): ruling (a) gates T017 only; ruling (b) means perf numbers are
measured first and the proposed thresholds are never asserted as gates until Matthew rules.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Maps the task to a user story in spec.md ([US1], [US2], [US3])
- Every description names its exact file path(s)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify the stacked series prerequisites and build the SC-004 measurement harness
FIRST, before any replay code exists (owner decision (b): measure before committing).

- [ ] T001 Verify stacked prerequisites on `km/derived-keyboard`: 088 `decisionStore` + drafts at `DRAFT_VERSION` 2 in packages/studio/src/lib/draftPersistence.ts, 089 pure `apply` + patch runner in packages/studio/src/steps/mutateApply.ts, 090 decision modules with per-item provenance in packages/studio/src/survey/questions/registry.ts, 092 setup-as-a-decision; record the audit in specs/093-derived-keyboard/research.md (appendix) and HALT if any prerequisite is missing — do not reinvent it inside 093
- [ ] T002 Build the SC-004 measurement harness in packages/studio/src/decisions/rebuildPerf.measure.ts: median single-decision-edit rebuild time and resume (full-rebuild) time on `sil_euro_latin` over a fixed run count, runnable against the current (pre-093) working-copy path as the baseline; write the baseline numbers to specs/093-derived-keyboard/perf-baseline.md with the proposed thresholds (<300 ms edit / <2 s resume) recorded as PROPOSED, pending Matthew's ruling — not gates

**Checkpoint**: Prerequisites verified; baseline perf evidence exists.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The pure replay core every story builds on. No store wiring yet.

- [ ] T003 [P] Implement downstream closure (reverse reachability over the `orderByDependencies` graph from `indexProviders`) in packages/studio/src/decisions/downstreamClosure.ts, with unit tests in packages/studio/src/decisions/downstreamClosure.test.ts (FR-002)
- [ ] T004 [P] Implement the pure replay engine in packages/studio/src/decisions/replayKeyboard.ts: `replay(startingPointIR, decisions, order)` applies each decision's `apply` through the 089 patch runner and returns the `KeyboardIR`; a `RawKmnFragment`-bearing fixture test proves fragments pass through unchanged, in packages/studio/src/decisions/replayKeyboard.test.ts (FR-001)
- [ ] T005 Implement in-memory per-decision IR checkpoints in packages/studio/src/decisions/replayCheckpoints.ts (checkpoint after each `apply`, index 0 = starting point; never persisted), with tests in packages/studio/src/decisions/replayCheckpoints.test.ts (FR-003)
- [ ] T006 Implement the provenance recalculation rule in packages/studio/src/decisions/recalculate.ts over the closure: `extracted` → re-run `extract`; `default`/`derived` → recompute; `asked` → keep + `validate` against new inputs, on failure keep + flag + re-propose via packages/studio/src/stores/reproposalNoticeStore.ts (never overwrite); collections recomputed per item (suggested recompute, hand-set kept, orphaned hand-set shown); gated-off → record kept with `inactive: true`, restored when the gate clears (FR-002, US1 scenarios 1–6)

**Checkpoint**: Foundation ready — pure replay + closure + provenance rule unit-green; no live wiring yet.

---

## Phase 3: User Story 1 — Changing a decision updates the keyboard (Priority: P1) 🎯 MVP

**Goal**: A decision change in the live wizard recalculates its downstream closure and rebuilds
the working copy; author choices survive, studio-supplied values refresh.

**Independent Test**: Playwright walk in `pnpm dev` changing `windows-layout` after mechanisms,
checking both survivals and refreshes (spec US1), plus the store-level provenance-matrix tests.

### Tests for User Story 1

- [ ] T007 [P] [US1] Provenance-matrix tests for scenarios 1–3 and 6 (extracted re-runs; default/derived recompute; asked kept when valid; gated-off kept inactive and restored) in packages/studio/src/decisions/recalculate.test.ts
- [ ] T008 [P] [US1] Tests for scenario 4 (asked-no-longer-fits: kept, flagged, re-proposed beside the recomputed value via `reproposalNoticeStore`, never overwritten) in packages/studio/src/decisions/reproposalNotice.test.ts and scenario 5 (collection per-item recompute/keep/orphan-shown, generalising repropagate R2/R6) in packages/studio/src/decisions/recalculate.collections.test.ts

### Implementation for User Story 1

- [ ] T009 [US1] Wire decision changes to recalculation at the StepHost/StudioShell seam: a change in packages/studio/src/stores/decisionStore.ts (088) triggers closure + recalculate + replay from the checkpoint before the first changed decision, and the rebuilt IR becomes the working copy in packages/studio/src/stores/workingCopyStore.ts; the rebuild is a write only — validation still runs once in the existing D3 cycle, no new timer
- [ ] T010 [US1] Re-point the `staleSteps` consumers (packages/studio/src/steps/reducer.ts, packages/studio/src/StudioShell.tsx, MechanismGallery progression path) to the general closure + provenance rule, and prove the spec-014 repropagate contract tests (R1–R6 semantics) pass against the general rule in their existing test files
- [ ] T011 [US1] Delete packages/studio/src/steps/repropagate.ts and the `staleSteps` slice (packages/studio/src/stores/workingCopyStore.ts, packages/studio/src/lib/persistWorkingCopy.ts); zero remaining references in packages/studio/src (FR-005)
- [ ] T012 [US1] Add the SC-001 Playwright walk (change `windows-layout` after carve and mechanisms; survivals and refreshes asserted) in packages/studio/e2e/derived-keyboard.spec.ts and run it in `pnpm dev`

**Checkpoint**: US1 fully functional in the live app; `repropagate`/`staleSteps` gone.

---

## Phase 4: User Story 2 — Drafts hold decisions only (Priority: P1)

**Goal**: A draft saves the starting point's id and the decisions, nothing else; a reload
rebuilds exactly the keyboard the author had.

**Independent Test**: The saved draft has no `workingCopy` slice, and the source rebuilt on
load is byte-identical to the source before the reload (spec US2, SC-003).

- [ ] T013 [US2] GATE (no code): record Matthew's ruling on owner decision (a) — changing the starting point: recalculation vs new project carrying answers over — verbatim in specs/093-derived-keyboard/spec.md (replacing the [NEEDS CLARIFICATION] marker) and in specs/093-derived-keyboard/plan.md; T017 is BLOCKED until this task completes and must not be implemented on an assumed answer. All other tasks in this phase proceed regardless of the ruling
- [ ] T014 [P] [US2] Capture a v2 draft fixture (decisions + `workingCopy` slice, from the stacked 088–092 branch state) in packages/studio/src/lib/__fixtures__/v2Draft.json for the migration test
- [ ] T015 [US2] Set `DRAFT_VERSION` to 3 and change the envelope in packages/studio/src/lib/draftPersistence.ts to save the starting point's id and the `decisions` slice only — no `workingCopy` slice (FR-004)
- [ ] T016 [US2] Implement the v2→v3 migration in packages/studio/src/lib/draftPersistence.ts: rebuild from the v2 draft's decisions, drop the stored `workingCopy` slice when the rebuilt source matches it byte-for-byte; on mismatch, log it and use the stored slice for that one load; tests against the T014 fixture in packages/studio/src/lib/draftPersistence.v3.test.ts (FR-004)
- [ ] T017 [US2] **BLOCKED on T013 (owner ruling (a))** Implement starting-point-change behaviour exactly as ruled, with its test in packages/studio/src/decisions/startingPointChange.test.ts (recalculation through the widest closure, or new-project carry-over — as ruled, not as assumed)
- [ ] T018 [US2] Make resume a full replay on load (starting point + saved decisions → working copy) in packages/studio/src/lib/draftPersistence.ts and its StudioShell load path in packages/studio/src/StudioShell.tsx; add the SC-003 reload walk (byte-identical source, no `workingCopy` slice in the saved draft) to packages/studio/e2e/derived-keyboard.spec.ts

**Checkpoint**: Drafts are decisions-only at v3; v2 drafts migrate; reload rebuild is byte-identical. (T017 may still be gated on the owner ruling without blocking this checkpoint.)

---

## Phase 5: User Story 3 — Edits stay fast (Priority: P2)

**Goal**: Incremental replay from checkpoints keeps a single edit quick on a large starting
point, proven deterministic and measured.

**Independent Test**: The SC-002 property test (incremental rebuild equals full replay, byte
for byte) and the SC-004 measurements on `sil_euro_latin`.

- [ ] T019 [US3] Implement incremental replay: on an edit, start from the checkpoint before the first changed decision (packages/studio/src/decisions/replayCheckpoints.ts) and replay only the closure onward, in packages/studio/src/decisions/replayKeyboard.ts (FR-003)
- [ ] T020 [US3] Add the SC-002 determinism property test (random decision-edit sequences; incremental rebuild === full replay, byte for byte) in packages/studio/src/decisions/replayDeterminism.test.ts
- [ ] T021 [US3] Re-run the T002 harness against the replay path on `sil_euro_latin` and append edit/resume medians to specs/093-derived-keyboard/perf-baseline.md, presented against the PROPOSED <300 ms / <2 s numbers as evidence for owner ruling (b) — do not convert them into pass/fail gates unless Matthew has ruled
- [ ] T022 [US3] CONDITIONAL on T021 measurements requiring it (FR-006): implement the disposable rebuild cache for resume in packages/studio/src/decisions/rebuildCache.ts, keyed by (starting point id + decision set) and discarded whenever the T020 determinism check disagrees with it; if measurements do not require it, record that conclusion in specs/093-derived-keyboard/perf-baseline.md instead and close this task as not-required

**Checkpoint**: Incremental replay is provably identical to full replay; perf evidence is on record for the owner's budget ruling.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Series close-out — after 093, the decisions are the only stored state.

- [ ] T023 [P] Run the golden walk (089 SC-001 baseline script, copy track from `basic_kbdfr`) and confirm the source zip is byte-identical (SC-005); record the run in specs/093-derived-keyboard/quickstart.md validation notes
- [ ] T024 [P] Grep gates: zero references to `staleSteps`, `repropagate`, or a saved `workingCopy` draft slice in packages/studio/src; confirm the 093 duplication ledger is fully retired and record it in specs/093-derived-keyboard/spec.md (Status/duplication ledger)
- [ ] T025 Amend Constitution Article III in .specify/memory/constitution.md to describe the working copy as a derived cache produced by replay (per plan.md Constitution Check, the 087 Article IX precedent), in the same change series as the implementation it describes
- [ ] T026 Full verification: studio vitest suite, `tsc --noEmit`, `eslint`, and `depcruise` green from the repo root tooling; parity suites inherited from 088 (FR-009 descendants) pass unmodified
- [ ] T027 Update specs/093-derived-keyboard/spec.md status to implemented (leaving owner decision (a)/(b) text as ruled, or as still-pending if unruled) and note any follow-ups in specs/093-derived-keyboard/followups.md if the implementation surfaces them

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — starts immediately. T002 (measurement) is deliberately
  first: owner decision (b) requires evidence before thresholds.
- **Foundational (Phase 2)**: Depends on Setup. BLOCKS all user stories.
- **US1 (Phase 3)**: Depends on Foundational. The MVP.
- **US2 (Phase 4)**: Depends on Foundational; integrates with US1's replay wiring (T009) for
  resume (T018) but its draft-format work (T014–T016) can proceed in parallel with US1.
  **T017 alone is blocked on owner ruling (a) via the T013 gate.**
- **US3 (Phase 5)**: Depends on US1 (incremental replay extends the wired rebuild path).
- **Polish (Phase 6)**: Depends on US1 + US2 (T017 excepted if still gated) + US3.

### User Story Dependencies

- **US1 (P1)**: After Foundational — no dependency on other stories.
- **US2 (P1)**: After Foundational; T018 uses US1's rebuild wiring. Story is independently
  testable via the draft-fixture and reload tests.
- **US3 (P2)**: After US1; determinism property (T020) also guards US2's resume path.

### Within Each User Story

- Tests before the implementation they pin (T007/T008 → T009–T011; T014/T016 fixture-first).
- Deletion (T011) only after consumers are re-pointed and the old contract tests pass against
  the general rule (T010).
- Commit after each task or logical group; push to `km/derived-keyboard` as each phase passes.

### Parallel Opportunities

- T003 and T004 are independent modules ([P]).
- T007 and T008 are independent test files ([P]).
- US2's draft-format tasks (T014–T016) can run parallel to US1's wiring (different files).
- T023 and T024 are independent close-out checks ([P]).

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Setup (prerequisite audit + perf baseline)
2. Phase 2: Foundational (closure, replay, checkpoints, provenance rule)
3. Phase 3: US1 — recalculation live in the wizard, `repropagate` retired
4. **STOP and VALIDATE**: SC-001 walk in `pnpm dev`
5. Continue with US2, then US3, then Polish — one user-story phase per conversation
   (constitution, Companion multi-phase rule)

### Incremental Delivery

Setup + Foundational → US1 (recalculation) → US2 (decisions-only drafts) → US3 (incremental
speed + perf evidence) → Polish (ledger closed, Article III amended). Each story leaves the
live app working and the golden walk byte-identical.

### Open decisions carried, not resolved

- **(a)** Starting-point change: T013/T017 gate. Nothing else waits on it.
- **(b)** Perf budgets: T002/T021 measure; the proposed <300 ms / <2 s become gates only on
  Matthew's ruling.

---

## Notes

- No `packages/contracts` changes anywhere in this task list; if a task appears to need one,
  stop and escalate (plan.md, Constitution Check Article I).
- No new timer anywhere: the rebuild is a write; validation stays in the existing D3 cycle.
- File names for new modules are plan.md's working names; consolidation is acceptable if the
  purity boundary (no store reads inside the replay engine) and the named test files land.

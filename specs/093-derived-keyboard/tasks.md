# Tasks: The keyboard is derived from decisions

**Input**: Design documents from `/specs/093-derived-keyboard/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md

**Tests**: The spec's success criteria are test-shaped (Playwright walks in `pnpm dev`,
store-level tests through the real `StepHost`, a determinism property test), so test tasks are
included, written before the implementation they pin.

**Organization**: Tasks are grouped by user story. Both owner decisions were ruled on
2026-10-06 (owner adopted the km-lead proposals; plan.md, "Owner decisions (ruled
2026-10-06)"): (a) starting-point change is **recalculation** — T013 records it, T017 is
unblocked; (b) SC-004's method is **measure-first** — medians with split protocols, never an
absolute-ms CI gate, and the proposed thresholds stay proposed until T021 plus a later
ruling. Cross-spec analyze amendments I-1 (five-channel replay), I-2 (draft key suffix) and
I-4 (T001 audit) are folded into the tasks below.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Maps the task to a user story in spec.md ([US1], [US2], [US3])
- Every description names its exact file path(s)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify the stacked series prerequisites and build the SC-004 measurement harness
FIRST, before any replay code exists (owner decision (b): measure before committing).

- [x] T001 Verify stacked prerequisites on `km/derived-keyboard`: 088 `decisionStore` + drafts at `DRAFT_VERSION` 2 in packages/studio/src/lib/draftPersistence.ts, 089 pure `apply` + the patch runner **`applyDecisionEffects` in packages/studio/src/steps/reducer.ts** (cross-spec analyze I-4: packages/studio/src/steps/mutateApply.ts holds only `applyMutatePatch` containment, not the runner) + the landed five-channel `WorkingCopyPatch` shape (`ir`/`identity`/`attribution`/`helpDocs`/`historyEntryState`, I-1), 090 decision modules with per-item provenance in packages/studio/src/survey/questions/registry.ts, **091 derived steps in packages/studio/src/steps/**, 092 setup-as-a-decision; record the audit in specs/093-derived-keyboard/research.md (appendix) and HALT if any prerequisite is missing — do not reinvent it inside 093 — **AUDIT DONE at the pipelined start (research.md appendix): every predecessor prerequisite was MISSING from this branch's tree; dependent work HALTED, T003 proceeded. RE-RUN at the cascade restack (merge `7c715d60`, `km/live-extraction` @ `4600dc18`): all prerequisites verified present — 088/089/092 complete, 090's landed modules + per-item provenance in tree (its US3/T063 still in flight upstream), 091 order derivation in tree (its `stepDependencies` deletion + parity gate held for 090, per the pipeline rule). Nothing missing outright; HALT LIFTED, Phases 2–6 proceed**
- [x] T002 Build the SC-004 measurement harness in packages/studio/src/decisions/rebuildPerf.measure.ts: median single-decision-edit rebuild time and resume (full-rebuild) time on `sil_euro_latin` over a fixed run count, runnable against the current (pre-093) working-copy path as the baseline; write the baseline numbers to specs/093-derived-keyboard/perf-baseline.md with the proposed thresholds (<300 ms edit / <2 s resume) recorded as PROPOSED, pending Matthew's ruling — not gates

**Checkpoint**: Prerequisites verified; baseline perf evidence exists.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The pure replay core every story builds on. No store wiring yet.

- [x] T003 [P] Implement downstream closure (reverse reachability over the `orderByDependencies` graph from `indexProviders`) in packages/studio/src/decisions/downstreamClosure.ts, with unit tests in packages/studio/src/decisions/downstreamClosure.test.ts (FR-002)
- [x] T004 [P] Implement the pure replay engine in packages/studio/src/decisions/replayKeyboard.ts: `replay(startingPointIR, decisions, order)` applies each decision's `apply` through the 089 patch runner (`applyDecisionEffects`) and returns the rebuilt state — the `KeyboardIR` **plus the overlay accumulator folding all five `WorkingCopyPatch` channels** (`identity`/`attribution`/`helpDocs`/`historyEntryState` beside `ir`; cross-spec analyze I-1 — an IR-only result cannot satisfy FR-001/SC-003). `ApplyContext.currentHistoryEntryState` is read from the accumulator folded so far, never from a store. Tests in packages/studio/src/decisions/replayKeyboard.test.ts prove the non-IR channels land (identity/attribution in the emitted header, helpDocs in output) and that a `RawKmnFragment`-bearing fixture passes fragments through unchanged (FR-001)
- [x] T005 Implement in-memory per-decision checkpoints in packages/studio/src/decisions/replayCheckpoints.ts (checkpoint after each `apply` retaining the IR **and the overlay accumulator** (I-1), index 0 = starting point + empty overlay; never persisted), with tests in packages/studio/src/decisions/replayCheckpoints.test.ts (FR-003)
- [x] T006 Implement the provenance recalculation rule in packages/studio/src/decisions/recalculate.ts over the closure: `extracted` → re-run `extract`; `default`/`derived` → recompute; `asked` → keep + `validate` against new inputs, on failure keep + flag + re-propose via packages/studio/src/stores/reproposalNoticeStore.ts (never overwrite); collections recomputed per item (suggested recompute, hand-set kept, orphaned hand-set shown); gated-off → record kept with `inactive: true`, restored when the gate clears (FR-002, US1 scenarios 1–6)

**Checkpoint**: Foundation ready — pure replay + closure + provenance rule unit-green; no live wiring yet.

---

## Phase 3: User Story 1 — Changing a decision updates the keyboard (Priority: P1) 🎯 MVP

**Goal**: A decision change in the live wizard recalculates its downstream closure and rebuilds
the working copy; author choices survive, studio-supplied values refresh.

**Independent Test**: Playwright walk in `pnpm dev` changing `windows-layout` after mechanisms,
checking both survivals and refreshes (spec US1), plus the store-level provenance-matrix tests.

### Tests for User Story 1

- [x] T007 [P] [US1] Provenance-matrix tests for scenarios 1–3 and 6 (extracted re-runs; default/derived recompute; asked kept when valid; gated-off kept inactive and restored) in packages/studio/src/decisions/recalculate.test.ts
- [x] T008 [P] [US1] Tests for scenario 4 (asked-no-longer-fits: kept, flagged, re-proposed beside the recomputed value via `reproposalNoticeStore`, never overwritten) in packages/studio/src/decisions/reproposalNotice.test.ts and scenario 5 (collection per-item recompute/keep/orphan-shown, generalising repropagate R2/R6) in packages/studio/src/decisions/recalculate.collections.test.ts

### Implementation for User Story 1

- [x] T009 [US1] Wire decision changes to recalculation at the StepHost/StudioShell seam: a change in packages/studio/src/stores/decisionStore.ts (088) triggers closure + recalculate + replay from the checkpoint before the first changed decision, and the rebuilt state becomes the working copy in packages/studio/src/stores/workingCopyStore.ts — the IR **and the overlay channels installed from the accumulator** (I-1), not the IR alone; the rebuild is a write only — validation still runs once in the existing D3 cycle, no new timer
- [ ] T010 [US1] Re-point the `staleSteps` consumers (packages/studio/src/steps/reducer.ts, packages/studio/src/StudioShell.tsx, MechanismGallery progression path) to the general closure + provenance rule, and prove the spec-014 repropagate contract tests (R1–R6 semantics) pass against the general rule in their existing test files
- [ ] T011 [US1] Delete packages/studio/src/steps/repropagate.ts and the `staleSteps` slice (packages/studio/src/stores/workingCopyStore.ts, packages/studio/src/lib/persistWorkingCopy.ts); zero remaining references in packages/studio/src (FR-005)
- [x] T012 [US1] Add the SC-001 Playwright walk (change `windows-layout` after carve and mechanisms; survivals and refreshes asserted) in packages/studio/e2e/derived-keyboard.spec.ts and run it in `pnpm dev`

**Checkpoint**: US1 fully functional in the live app; `repropagate`/`staleSteps` gone.

---

## Phase 4: User Story 2 — Drafts hold decisions only (Priority: P1)

**Goal**: A draft saves the starting point's id and the decisions, nothing else; a reload
rebuilds exactly the keyboard the author had.

**Independent Test**: The saved draft has no `workingCopy` slice, and the source rebuilt on
load is byte-identical to the source before the reload (spec US2, SC-003).

- [x] T013 [US2] GATE (no code) — SATISFIED 2026-10-06: owner ruling on decision (a) received ("Use the proposals", km-lead proposals Q6) and recorded: **changing the starting point is a RECALCULATION** (re-extract everything; `asked` answers kept under the validate/re-propose rule). Recorded in specs/093-derived-keyboard/spec.md (the [NEEDS CLARIFICATION] marker is replaced by the ruling), plan.md ("Owner decisions (ruled 2026-10-06)") and research.md §8 by the plan-amendment commit. T017 is UNBLOCKED and proceeds as recalculation
- [ ] T014 [P] [US2] Capture a v2 draft fixture (decisions + `workingCopy` slice, from the stacked 088–092 branch state) in packages/studio/src/lib/__fixtures__/v2Draft.json for the migration test
- [ ] T015 [US2] Set `DRAFT_VERSION` to 3 and change the envelope in packages/studio/src/lib/draftPersistence.ts to save the starting point's id and the `decisions` slice only — no `workingCopy` slice (FR-004). Note the version is embedded in the localStorage key suffix (`ks.draft.<projectKey>.v3`) — the scan/migration consequences land in T016 (cross-spec analyze I-2)
- [ ] T016 [US2] Implement the v2→v3 migration in packages/studio/src/lib/draftPersistence.ts: rebuild from the v2 draft's decisions, drop the stored `workingCopy` slice when the rebuilt source matches it byte-for-byte; on mismatch, log it and use the stored slice for that one load (FR-004). **Key-suffix requirement (cross-spec analyze I-2):** the migration must run through the boot scan, not just a file load — the v3 build's scan must also find `.v2` keys despite the suffix filter (extending 088's T010 migrate-before-gate pattern), and a draft last saved under v1 and first opened on a v3 build must chain v1→v2→v3 within that one load. Tests in packages/studio/src/lib/draftPersistence.v3.test.ts cover BOTH the T014 fixture AND the scan path (`.v2` — and `.v1` — keys seeded in localStorage); the fixture test alone would pass while real drafts stay invisible to the scan
- [x] T017 [US2] Implement starting-point-change behaviour **as ruled (T013): recalculation** — a starting-point change re-runs replay through the widest closure against the new starting point: `extracted` values re-extract with `source` naming the new keyboard, `default`/`derived` recompute, `asked` answers kept under the validate/re-propose rule (never silently overwritten); prior decision-log entries keep the old keyboard as their historical source and superseding entries name the new one. Test in packages/studio/src/decisions/startingPointChange.test.ts
- [ ] T018 [US2] Make resume a full replay on load (starting point + saved decisions → working copy) in packages/studio/src/lib/draftPersistence.ts and its StudioShell load path in packages/studio/src/StudioShell.tsx; add the SC-003 reload walk (byte-identical source, no `workingCopy` slice in the saved draft) to packages/studio/e2e/derived-keyboard.spec.ts

**Checkpoint**: Drafts are decisions-only at v3; v2 (and chained v1) drafts migrate via the boot scan; reload rebuild is byte-identical; starting-point change recalculates per the owner's ruling (T013/T017).

---

## Phase 5: User Story 3 — Edits stay fast (Priority: P2)

**Goal**: Incremental replay from checkpoints keeps a single edit quick on a large starting
point, proven deterministic and measured.

**Independent Test**: The SC-002 property test (incremental rebuild equals full replay, byte
for byte) and the SC-004 measurements on `sil_euro_latin`.

- [x] T019 [US3] Implement incremental replay: on an edit, start from the checkpoint before the first changed decision (packages/studio/src/decisions/replayCheckpoints.ts) and replay only the closure onward, in packages/studio/src/decisions/replayKeyboard.ts (FR-003)
- [x] T020 [US3] Add the SC-002 determinism property test (random decision-edit sequences; incremental rebuild === full replay, byte for byte) in packages/studio/src/decisions/replayDeterminism.test.ts
- [x] T021 [US3] Re-run the T002 harness against the replay path on `sil_euro_latin` and append the figures to specs/093-derived-keyboard/perf-baseline.md per the RULED method (owner, 2026-10-06, km-lead proposals Q7): **medians with split protocols — edit as a warm median, resume as a cold median** — presented against the still-PROPOSED <300 ms / <2 s numbers as evidence. Do NOT convert them into absolute-ms pass/fail gates (in CI or anywhere); the numbers become thresholds only via a later owner ruling after this re-measurement, and any hard gate then set is relative to the recorded baseline
- [x] T022 [US3] CONDITIONAL on T021 measurements requiring it (FR-006): implement the disposable rebuild cache for resume in packages/studio/src/decisions/rebuildCache.ts, keyed by (starting point id + decision set) and discarded whenever the T020 determinism check disagrees with it; if measurements do not require it, record that conclusion in specs/093-derived-keyboard/perf-baseline.md instead and close this task as not-required

**Checkpoint**: Incremental replay is provably identical to full replay; perf evidence is on record for the owner's budget ruling.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Series close-out — after 093, the decisions are the only stored state.

- [x] T023 [P] Run the golden walk (089 SC-001 baseline script, copy track from `basic_kbdfr`) and confirm the source zip is byte-identical (SC-005); record the run in specs/093-derived-keyboard/quickstart.md validation notes — RUN RECORDED 2026-10-07: harness executes; both tracks fail ONLY on the characterised 089/090-owned decisionMutations fixture delta (identical at pre-093 baseline); SC-005 byte-identity NOT confirmable until the upstream fixture regen cascades — see quickstart.md validation notes
- [ ] T024 [P] Grep gates: zero references to `staleSteps`, `repropagate`, or a saved `workingCopy` draft slice in packages/studio/src; confirm the 093 duplication ledger is fully retired and record it in specs/093-derived-keyboard/spec.md (Status/duplication ledger)
- [ ] T025 Amend Constitution Article III in .specify/memory/constitution.md to describe the working copy as a derived cache produced by replay (per plan.md Constitution Check, the 087 Article IX precedent), in the same change series as the implementation it describes
- [ ] T026 Full verification: studio vitest suite, `tsc --noEmit`, `eslint`, and `depcruise` green from the repo root tooling; parity suites inherited from 088 (FR-009 descendants) pass unmodified
- [ ] T027 Update specs/093-derived-keyboard/spec.md status to implemented (owner decision (a) text as ruled — recalculation; decision (b) text as ruled on method — measure-first — with the <300 ms / <2 s numbers left as proposed unless a post-T021 ruling has since set them) and note any follow-ups in specs/093-derived-keyboard/followups.md if the implementation surfaces them

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — starts immediately. T002 (measurement) is deliberately
  first: owner decision (b) requires evidence before thresholds.
- **Foundational (Phase 2)**: Depends on Setup. BLOCKS all user stories.
- **US1 (Phase 3)**: Depends on Foundational. The MVP.
- **US2 (Phase 4)**: Depends on Foundational; integrates with US1's replay wiring (T009) for
  resume (T018) but its draft-format work (T014–T016) can proceed in parallel with US1.
  **T013's gate is satisfied (ruling (a) received 2026-10-06); T017 is unblocked.**
- **US3 (Phase 5)**: Depends on US1 (incremental replay extends the wired rebuild path).
- **Polish (Phase 6)**: Depends on US1 + US2 + US3.

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

### Open decisions — both ruled 2026-10-06 (km-lead proposals, adopted by the owner)

- **(a)** Starting-point change: **recalculation** (Q6). T013 records the ruling; T017
  implements it. Nothing is gated on it any longer.
- **(b)** Perf budgets: **measure-first is the method** (Q7) — medians with split protocols
  (warm edit / cold resume) in perf-baseline.md, never an absolute-ms CI gate. T002/T021
  measure; the proposed <300 ms / <2 s become thresholds only via a later owner ruling after
  T021, and any hard gate is then relative to the recorded baseline.

---

## Notes

- No `packages/contracts` changes anywhere in this task list; if a task appears to need one,
  stop and escalate (plan.md, Constitution Check Article I).
- No new timer anywhere: the rebuild is a write; validation stays in the existing D3 cycle.
- File names for new modules are plan.md's working names; consolidation is acceptable if the
  purity boundary (no store reads inside the replay engine) and the named test files land.

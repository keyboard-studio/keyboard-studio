# Tasks: Output from the replayed keyboard

**Input**: [plan.md](plan.md), [spec.md](spec.md), [data-model.md](data-model.md),
[contracts/emit.md](contracts/emit.md), [research.md](research.md).

**Phasing**: the plan's six phases (0 to 5) become Setup, Foundational (defects, plan phase 0) and
one story phase per plan phase 1 to 5. Each phase is landable alone and keeps the golden fixtures
byte-identical, except where an FR-020 fix changed them on purpose (FR-030).

**Shared files**: the nine defect fixes touch files that later phases also edit (for example
`projectWorkingCopyVfs.ts` and `applyAssignments.ts`). They land first, in Foundational. Each later
phase starts only after the phase before it has joined, so no two workers edit one file at once.

**Gates**: `pnpm typecheck` and `pnpm lint` on every phase. Full gate (`pnpm typecheck`,
`pnpm -r test`, `pnpm lint`) on phases that touch `packages/engine/src/codec` and on the last phase.
Corpus-gated tests need `../keyboards` at the CI pin (`KEYBOARDS_CORPUS_SHA` in `.github/workflows/ci.yml`).

## Phase 1: Setup

- [x] **T001** Capture the baseline: golden fixture outputs (`__fixtures__/flagParity/fullSpine.kmn` and the reference keyboard) and rebuild timings (`rebuildPerf.measure`) on an unchanged tree, for FR-030 and FR-032 · `packages/studio/src/lib/` (baseline record under `specs/118-replayed-ir-output/evidence/baseline.md`)
- [x] **T002** Confirm `../keyboards` is at `KEYBOARDS_CORPUS_SHA` and that spec 117's explicit-keystroke change and spec 105's phases are their current state, so the blocking edges in Phases 4 and 7 are real · `.github/workflows/ci.yml`

**Checkpoint**: baseline recorded; corpus pin confirmed.

## Phase 2: Foundational (FR-020 defects, plan phase 0)

Each defect gets a failing regression test first, then one fix commit. Defects a test cannot
reproduce are recorded as such and keep their regression test (research R7). This phase blocks all
story phases.

**Wave 1 — independent (different files):**

- [x] **T003** [P] [US1] Defect (b): rebuild keeps the `docFixProposals` channel that `foldPatch` and `installRebuiltState` drop · `packages/studio/src/decisions/replayKeyboard.ts` + `replayKeyboard.docFixProposals.test.ts` (new)
- [x] **T004** [P] [US3] Defect (c): the D3 validator checks the replayed keyboard's emitted text, not the unedited `startVfs` · `packages/studio/src/StudioShell.tsx` (lines near 1223) + `StudioShell.validationInput.test.ts` (new)
- [x] **T005** [P] [US1] Defect (f): `OskCodePane`, `TouchCodePane`, `OskEditor` and `docRegenerationFix` replace starting-point files through the replay wrapper · the four files named in the defect, located by grep + one regression test per editor (new test files beside each)
- [x] **T006** [P] [US2] Defect (i): bare pattern rules target the entry group, not a group literally named `main`; additions to a group the starting keyboard lacks are kept · `packages/engine/src/pattern-apply/applyAssignments.ts` + `applyAssignments.entryGroup.test.ts` (new)
- [x] **T007** [P] [US2] Defect (g): dead-key `repoint` ops store rule node ids that re-mint after carve re-parse; store a stable reference · `packages/studio/src/editors/deadkey/deadkeyWrite.ts` + `deadkeyWrite.test.ts` (as built: the `repoint` op lives in the studio deadkey editor, not the engine `keyEditOps.ts`)

**⟶ Wait for Wave 1 to finish, then:**

**Wave 2 — independent (different files):**

- [x] **T008** [P] [US1] Defect (a): a touch-key rename's rule half reaches the download; `keyEditOps` is non-empty on the output path · `packages/studio/src/lib/projectionInput.ts` (line near 158) + `projectionInput.touchRename.test.ts` (new). Needs T007.
- [x] **T009** [P] [US1] Defect (e): an opened keyboard's preview passes `openMode`, so preview and download agree · the preview compile path (located by grep for `openMode`) + `preview.openMode.test.ts` (new)

**⟶ Wait for Wave 2 to finish, then:**

**Wave 3 — one file, sequential (`projectWorkingCopyVfs.ts`):**

- [x] **T010** [US1] Defect (d): direct `emitKmn` calls in projection steps 2.8 and 4 go through `writeKmn`, so Open mode keeps byte identity · `packages/studio/src/lib/projectWorkingCopyVfs.ts` + `projectWorkingCopyVfs.unchangedGate.test.ts` (new)
- [x] **T011** [US2] Defect (h): Open-mode splices use line spans re-read after step 0b, not stale `startIr` spans · `packages/studio/src/lib/projectWorkingCopyVfs.ts`, `packages/studio/src/lib/openMode.ts` + `openMode.styleLine.test.ts` (new). Runs after T010.

**Checkpoint**: all nine regression tests (SC-003) green on the phase's own tests; golden fixtures byte-identical except where a fix changed them on purpose (FR-030). Full gate runs here (`packages/studio` and `packages/engine` touched).

## Phase 3: User Story 1 — one emit stage (plan phase 1, P1)

Adds `emit(state, mode)` beside the projection. Preview, download, archive, pull request and LDML read
it through an adapter. No behaviour change. Fixes are already in Phase 2.

**Wave 1 — independent (different files):**

- [x] **T012** [P] [US1] `emit(state, mode)` entry and the `unedited` and `copy` modes · `packages/engine/src/output/emit.ts` (new) + `packages/engine/src/output/emit.test.ts` (new)
- [x] **T013** [P] [US1] `open` mode: splice changed nodes into the author's text (spec 111); no reformat without consent · `packages/engine/src/output/openSplice.ts` (new) + `packages/engine/src/output/openSplice.test.ts` (new)

**⟶ Wait for Wave 1 to finish, then:**

**Wave 2 — independent (different files):**

- [x] **T014** [US1] Studio adapter: builds `state` and file-level inputs (descriptor, id renames, docs, fonts) and calls `emit` · `packages/studio/src/lib/emitAdapter.ts` (new) + `emitAdapter.test.ts` (new). Needs T012, T013.
- [x] **T015** [P] [US1] Switch LDML export to the adapter · `packages/studio/src/lib/ldmlExportInputs.ts`
- [x] **T016** [P] [US1] Switch download, source archive and pull-request paths to the adapter · `packages/studio/src/lib/buildOutputBundle.ts`

**⟶ Wait for Wave 2 to finish, then:**

**Wave 3:**

- [x] **T017** [US1] Agreement and golden gate: preview, download, archive, pull request and LDML agree for every fixture walk (SC-001); rebuild time re-measured against T001 (FR-032) · `packages/studio/src/lib/emitAgreement.test.ts` (new), `specs/118-replayed-ir-output/evidence/baseline.md`

**Checkpoint**: one `emit` used by every output path (FR-014); no caller re-reads generated text.

## Phase 4: User Story 2 — pattern application on the model (plan phase 2, P1)

Waits for spec 117's explicit-keystroke change (T002). Keeps the published pattern format.

**Wave 1 — independent (different files):**

- [ ] **T018** [P] [US2] Slot-substitute `{{slotId}}` as text first, then parse the fragment inside a scaffold (the `rulePacks/install.ts` precedent) · `packages/engine/src/pattern-apply/fragmentScaffold.ts` (new) + `fragmentScaffold.test.ts` (new)
- [ ] **T019** [P] [US2] Failing tests for the six FR-012 merge rules: rule precedence, end-of-group last, stores replaced by name, system stores refused with a warning, bare rules to entry group, idempotent re-apply · `packages/engine/src/pattern-apply/applyAssignmentsIR.merge.test.ts` (new)

**⟶ Wait for Wave 1 to finish, then:**

**Wave 2:**

- [ ] **T020** [US2] Merge into the model (`applyAssignmentsIR`), so T019 goes green · `packages/engine/src/pattern-apply/applyAssignmentsIR.ts` (new). Needs T018, T019.

**⟶ Wait for Wave 2 to finish, then:**

**Wave 3:**

- [ ] **T021** [US2] Route the pattern decision's `apply` through the IR merge; retire the text splice in `applyAssignmentsToVfs.ts` and `spliceKmn.ts` for patterns · `packages/engine/src/pattern-apply/applyAssignments.ts`, `applyAssignmentsToVfs.ts`, `spliceKmn.ts` (the last two lose their pattern path only)

**Checkpoint**: re-applying a pattern adds nothing (FR-012); golden fixtures unchanged except defect fixes.

## Phase 5: User Story 1 — touch layout and visual keyboard in replayed state (plan phase 3, P1)

FR-011 and FR-016. Retires spec 063 R10.2 as a separate pass once twin-equivalence is green.

**Wave 1 — independent (different files):**

- [ ] **T022** [P] [US1] Touch emit: mark a key hand-set only when a decision changed it; keep layout members the model does not describe · `packages/engine/src/codec/` touch emitter (located by grep for `TouchLayoutIR`) + `touchEmit.handSet.test.ts` (new)
- [ ] **T023** [P] [US1] IR twin for carve keycap removal · `packages/engine/src/pattern-apply/applyCarveIR.ts` (new) + `applyCarveIR.test.ts` (new)
- [ ] **T024** [P] [US1] IR twins for layer propagation and keycap labels · `packages/engine/src/pattern-apply/applyTouchIR.ts` (new) + `applyTouchIR.test.ts` (new)

**⟶ Wait for Wave 1 to finish, then:**

**Wave 2:**

- [ ] **T025** [US1] Twin-equivalence tests: IR twin and raw-JSON twin give the same touch layout for every operation (spec 063 §6.2, spec 035 R9 revised) · `packages/engine/src/pattern-apply/twinEquivalence.test.ts` (new). Needs T022 to T024.
- [ ] **T026** [US1] Move touch-key rule synthesis into the touch-layout decision's `apply` and delete the separate spec 063 R10.2 pass (locate by grep for `R10.2`) · `packages/studio/src/lib/projectWorkingCopyVfs.ts`. Runs after T011.

**⟶ Wait for Wave 2 to finish, then:**

**Wave 3:**

- [ ] **T027** [US1] Retire the raw-JSON twins, only now that T025 is green (spec 063 §6.2 revised) · the raw-JSON twin modules (located by grep for the layout operation names)

**Checkpoint**: a renamed touch key's rules reach every output (Story 1, scenario 1); touch layout keeps unknown members.

## Phase 6: User Story 2 — ordering from declared dependencies (plan phase 4, P1)

FR-013. Each position-implied constraint in the projection becomes a `requires` edge.

**Wave 1 — independent (different files):**

- [ ] **T028** [P] [US2] Shape of a `requires` edge in the decision registry · `packages/studio/src/decisions/derivedSurfaceRegistry.ts` + `requiresEdge.test.ts` (new)
- [ ] **T029** [P] [US2] Ordering gate: derived order must give the same output as the current stage order on the golden fixtures · `packages/studio/src/decisions/orderingEquivalence.test.ts` (new)

**⟶ Wait for Wave 1 to finish, then:**

**Wave 2:**

- [ ] **T030** [US2] Add one `requires` edge per constraint named in the step comments of `projectWorkingCopyVfs.ts` (the inventory), on the decision modules under `packages/studio/src/decisions/` · `packages/studio/src/decisions/` (decision modules). Needs T028.

**⟶ Wait for Wave 2 to finish, then:**

**Wave 3:**

- [ ] **T031** [US2] Make the ordering gate fail when a declared edge changes output; confirm `orderByDependencies` is the only order source (Art IX) · `packages/studio/src/decisions/orderingEquivalence.test.ts`, `orderByDependencies` module (located by grep)

**Checkpoint**: no stored step order; adding a step needs no change to the output stage.

## Phase 7: User Story 3 and User Story 4 — validation, equivalence and projection reduction (plan phase 5, P2/P3)

Waits for spec 105's surface phases (amended FR-007) and Phases 2, 4 and 6.

**Wave 1 — independent (different files):**

- [ ] **T032** [P] [US3] FR-017: the one validation cycle checks the emitted `.kmn` of the replayed keyboard; no new timer (D3) · `packages/studio/src/StudioShell.tsx` (validation input, extends T004) + `StudioShell.replayedValidation.test.ts` (new)
- [ ] **T033** [P] [US4] Equivalence gate names any write path to output-bearing state not declared as a decision · `packages/studio/src/decisions/derivedEquivalence.test.ts`
- [ ] **T034** [P] [US4] FR-031: build one change at a time and rebuild from scratch, for every surface, and compare the keyboard model · `packages/studio/src/decisions/replayDeterminism.test.ts`

**⟶ Wait for Wave 1 to finish, then:**

**Wave 2 — one file, sequential:**

- [ ] **T035** [US4] Reduce `projectWorkingCopyVfs.ts` to `emit` plus file-level work; remove every `parseKmn` call and the 14 ordered text steps · `packages/studio/src/lib/projectWorkingCopyVfs.ts`. Needs T017, T021, T026, T030.

**⟶ Wait for Wave 2 to finish, then:**

**Wave 3:**

- [ ] **T036** [US4] Delete `rulesStepAdded`, `deriveRuleAdditions` and the "never emitted" comment · `packages/studio/src/lib/projectWorkingCopyVfs.ts`, `packages/studio/src/decisions/` (where they are defined)
- [ ] **T037** [US4] Surfaces' `apply` returns the transformed keyboard, for each remaining surface (D-090-24 revised) · the surface decision modules under `packages/studio/src/decisions/`. Needs spec 105 phases.

**Checkpoint**: SC-007 shown by the first step added after this spec lands; no change to the output stage.

## Polish

- [ ] **T038** Re-measure rebuild after an edit (under 300 ms) and draft restore (under 2 s) on the reference keyboard, and report against the T001 baseline (SC-006, FR-032) · `specs/118-replayed-ir-output/evidence/baseline.md`
- [ ] **T039** Record the spec 063 and spec 035 AS-BUILT revisions and the spec 105 FR-002 and FR-007 amendment (Clarifications), and the `.kvks` text-pass follow-up with its trigger (end of Phase 7) · `specs/063-*/AS-BUILT.md`, `specs/035-*/AS-BUILT.md`, `specs/105-*/spec.md`, `specs/118-replayed-ir-output/spec.md`
- [ ] **T040** Validate against the Success Criteria (SC-001 to SC-007): run `pnpm typecheck`, `pnpm -r test` and `pnpm lint`, and record each result against its criterion · `specs/118-replayed-ir-output/evidence/validation.md` (new)

## Dependencies & Execution Order

- **Setup (T001 to T002)** → **Foundational (T003 to T011)** → **Phase 3 (US1 emit)** → **Phase 4 (US2 patterns)** and **Phase 5 (US1 touch)** → **Phase 6 (US2 ordering)** → **Phase 7 (US3, US4)** → **Polish**.
- Phases 4 and 5 both depend only on Foundational and Phase 3; they are sequential here because both edit `projectWorkingCopyVfs.ts` and `applyAssignments.ts`.
- Phase 4 waits on spec 117 (T002). Phase 7 waits on spec 105's surface phases. Phases 2, 3, 5 and 6 do not wait on either.
- Within each phase: Wave 1 blocks Wave 2, Wave 2 blocks Wave 3, as marked by the join lines above.

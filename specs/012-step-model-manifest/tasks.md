---
description: "Task list for Phase 4 — unified step model + manifest-driven survey ordering"
---

# Tasks: Unified Step Model + Manifest-Driven Survey Ordering

**Input**: Design documents from `specs/012-step-model-manifest/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: INCLUDED — the spec Success Criteria and the contracts explicitly require them (unchanged-suite parity SC-002, reducer parity R1–R6, completeness fixtures SC-006, depcruise probes B3). Test tasks are not optional for this feature.

**Delivery (Clarifications 2026-06-27)**: two sequential PRs.
- **PR1 = P4a** — Setup + Foundational + US1 (adapters behind `SurveyStage`) + US4 (reserved seams). Ships byte-identical; revertible by repointing imports.
- **PR2 = P4b** — US2 (manifest ordering + reducer + dashboard) + US3 (completeness/staleness) + Polish. Revertible without touching `editors/` (SC-009).

This is also the dependency order: P4b's union replacement **cannot** begin until P4a's adapters exist.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1–US4 (maps to spec.md user stories)
- All paths are repo-relative; root is `/home/user/keyboard-studio`.

---

## Phase 1: Setup (Shared Infrastructure) — PR1 / P4a

**Purpose**: baseline + directory skeleton. Folder names are **decided** (Clarifications: `editors/`, `steps/`, `dashboard/`).

- [ ] T001 Create the Phase-4 directory skeleton under `packages/studio/src/`: `steps/`, `editors/assignLoop/parts/`, `editors/carve/`, `editors/panels/`, `editors/touchSuggest/`, `editors/adapters/`, and a placeholder note that `flowmap/` → `dashboard/` rename happens in PR2 (T030). Use `.gitkeep` where no file lands yet.
- [ ] T002 [P] Capture the green baseline: run `pnpm typecheck`, `pnpm --filter @keyboard-studio/studio test`, and `pnpm depcruise`; record the pre-refactor pass counts in the PR description (the parity reference for SC-002 / SC-009).

---

## Phase 2: Foundational (Blocking Prerequisites) — PR1 / P4a

**Purpose**: the step-model type contract every story builds against.

**⚠️ CRITICAL**: No user-story work can begin until `steps/types.ts` exists.

- [ ] T003 Create `packages/studio/src/steps/types.ts` per [contracts/step-model.contract.md](contracts/step-model.contract.md): `StepKind`, `StepBase` (id/kind/title/spine/lock/joinTarget/inputs/writes), `QuestionStep` (questionId), `EditorStep` (component/surface), `Step` union, `EditorStepProps` (onComplete/onBack/ctx). Reuse `IRPath` from `@keyboard-studio/contracts` (G5).
- [ ] T004 [P] Create `packages/studio/src/steps/types.test.ts`: assert G1 (kind narrows to exactly two), a reusable `assertUniqueIds` helper for G4, and a compile-fixture that a bogus `IRPath` in `inputs`/`writes` fails typecheck (G5).

**Checkpoint**: step model compiles; stories can begin.

---

## Phase 3: User Story 1 — Galleries & panels become steps (Priority: P1) 🎯 MVP — PR1 / P4a

**Goal**: every gallery and the five wizard panels move into `editors/` and render through an editor-step adapter, **behind the unchanged `SurveyStage` machine**, with byte-identical behavior.

**Independent Test**: pick one gallery + one panel; confirm each renders via its adapter with `id`/`title`/`inputs`/`writes`, advances via a single completion callback, and behaves identically under the unchanged `SurveyStage` flow.

### Moves (preserve explicit `.ts`/`.tsx` import extensions — §8 / boundaries C-constraint)

- [ ] T005 [US1] Move `packages/studio/src/components/CarveGallery.tsx` → `packages/studio/src/editors/carve/CarveGallery.tsx` (+ colocated test if any); carve stays its **own** remove-mode component sharing only `ui/` (FR-004). Update all importers' specifiers incl. extension.
- [ ] T006 [US1] Move `packages/studio/src/components/carve/*` (DepBanner, GlyphCell, InfoView+test, Inspector, KeyCap, KeySeq, KindBadge, Rail, StatusBar, ToggleBox, carveShared) → `packages/studio/src/editors/assignLoop/parts/*` (shared chrome used by shell + carve).
- [ ] T007 [US1] Move + refactor `components/MechanismGallery.tsx` and `components/TouchGallery.tsx` into `editors/assignLoop/`: extract the shared add **shell** `AssignLoopShell.tsx` (surface-parameterized) with **separate** `physicalBehavior.ts` (keys/AltGr/dead keys) and `touchBehavior.ts` (layers/long-press/flick/multitap). **Not** a 3-into-1 merge (FR-004). Keep behavior identical.
- [ ] T008 [P] [US1] Move `components/GalleryIntroSplash.tsx` → `editors/assignLoop/IntroSplash.tsx` and `components/GalleryPreviewPane.tsx` → `editors/assignLoop/PreviewPane.tsx` (+ tests).
- [ ] T009 [US1] Move the five wizard panels → `editors/panels/`: `TrackStep.tsx`, `ProjectNameStep.tsx`, `ScaffoldForm.tsx`, `TrackOneIdentityPanel.tsx` (+test), `BaseResolution.tsx` (+test). Keep their current props/behavior (FR-005).

### Adapters → `EditorStepProps` (FR-003, G3)

- [ ] T010 [P] [US1] `editors/adapters/carveAdapter.tsx` — wrap carve (`onComplete`/`onBack` already) to `EditorStepProps`.
- [ ] T011 [P] [US1] `editors/adapters/addPhysicalAdapter.tsx` — wrap the physical add shell to `EditorStepProps` (surface `"physical"`).
- [ ] T012 [P] [US1] `editors/adapters/addTouchAdapter.tsx` — wrap the touch add shell to `EditorStepProps` (surface `"touch"`).
- [ ] T013 [P] [US1] `editors/adapters/panelAdapters.tsx` — normalize the non-uniform panel callbacks (`onNext(track)`, `onNext(displayName,keyboardId)`, `onResolved(base)`, `onSubmit(spec)`, store-reading identity panel) to one `onComplete(result)` each (D1).

### Wire behind the existing `SurveyStage` machine (no ordering change)

- [ ] T014 [US1] In `packages/studio/src/StudioShell.tsx`, repoint each `SurveyStage` stage to render the moved/adapted components via their adapters. **Imports only — the `SurveyStage` union and stage order stay exactly as-is** (FR-006). Side effects remain inline in `SurveyView` for now (moved in PR2/T026).

### Boundaries + verification

- [ ] T015 [US1] Add the editor boundary rule to `.dependency-cruiser.cjs` per [contracts/boundaries.contract.md](contracts/boundaries.contract.md): **allow** `editors/ → stores/` and `editors/ → lib/`; **forbid** `editors/ → dashboard/`. Keep `ui-is-a-leaf` green (B1, B2).
- [ ] T016 [P] [US1] Run the existing gallery/panel suites against the moved+adapted components **unchanged** — `CarveGallery`, `MechanismGallery.test`, `TouchGallery.test`, `BaseResolution.test`, `TrackOneIdentityPanel.test`, `GalleryIntroSplash.test`. All must pass with no edits to assertions (SC-002).
- [ ] T017 [US1] depcruise probe test (B3): temporarily add an `editors/ → dashboard/` import, confirm `pnpm depcruise` goes red, remove it, confirm green. Document in PR.

**Checkpoint**: galleries + panels are enumerable editor-steps, behavior byte-identical, `SurveyStage` still drives ordering. US1 independently shippable.

---

## Phase 4: User Story 4 — Reserved touch seams (Priority: P3) — PR1 / P4a

**Goal**: reserve the per-key provenance tag and the `touchSuggest` defaults-as-data policy; declare, do not execute.

**Independent Test**: a touch key can carry a provenance tag (default `hand-set`); the `touchSuggest` policy is overridable declarative data; **no** propagation logic runs.

- [ ] T018 [P] [US4] `editors/assignLoop/provenance.ts` — `TouchKeyProvenance` = `"base-derived" | "physical-suggested" | "hand-set"`; helper that defaults a key with no tag to `hand-set` (FR-020, D6).
- [ ] T019 [P] [US4] `editors/touchSuggest/defaults.ts` — `TouchSuggestPolicy` declarative data (widthBudget, numberRowTarget, modifierPolicy, deadKeyHost `"base"`, defaultGesture `"long-press"`); overridable per-key and policy-level (FR-021, data-model).
- [ ] T020 [US4] `editors/touchSuggest/touchSuggest.ts` — generator scaffold that reads the policy and could carry provenance + producing-default on output, but performs **no propagation/merge** this phase (FR-021/FR-022).
- [ ] T021 [P] [US4] `editors/assignLoop/provenance.test.ts` + `editors/touchSuggest/touchSuggest.test.ts` — assert default `hand-set`, policy override at both levels, and that no propagation code path executes (SC-010).

**Checkpoint**: seams reserved and inert. **End of PR1 (P4a).** Run [quickstart.md](quickstart.md) "P4a validation"; merge.

---

## Phase 5: User Story 2 — One ordering source, map == runtime (Priority: P1) — PR2 / P4b

**Goal**: a single `steps/manifest.ts` drives both runtime and dashboard; `SurveyStage` union removed; side effects fire from a step-id-keyed reducer.

**Independent Test**: reorder two manifest steps → both the running survey and the dashboard reflect it with no other edit; no `SurveyStage` union remains.

### Register adapters + manifest

- [ ] T022 [US2] `steps/registerQuestionSteps.ts` — adapt `QuestionModule`s to `question-step` resolved by `definition.id` through the existing registry; carry their P2 `inputs`/`writes`.
- [ ] T023 [US2] `steps/registerEditorSteps.ts` — adapt the US1 editor adapters to `editor-step` (with `surface`), supplying `id`/`title`/`inputs`/`writes`.
- [ ] T024 [US2] `steps/manifest.ts` — the ordered `Step[]`: spine order Identity → choose base → Characters → Carve → Mechanisms → (lock physical) → touch carve+add → (lock touch) → Help → Package(reserved); add the `touch_seed_source` `spine:false` fork with `joinTarget` to the touch carve/add spine step (FR-012, FR-013, M2–M4).
- [ ] T025 [P] [US2] `steps/manifest.test.ts` — M2 (spine order), M3 (exactly two locks in order), M4 (fork + resolving joinTarget), M5 (unique ids), M6 (no A–G vocabulary).

### Reducer (moves the three inline side effects)

- [ ] T026 [US2] `steps/reducer.ts` — `applyStepCompletion(stepId, result, store)` keyed by step id: Mechanisms→`lockDesktop()` (today `StudioShell.tsx:377`); touch→`buildTouchLayoutJson` block + `setTouchLayoutJson` (today `:388–410`, same Case-A/B + graceful degradation); instantiate→Track2 `instantiateFromExisting` / Track1 `instantiateFromBaseIfConfirmed` (today `:240–253`). (FR-011, R1–R3)
- [ ] T027 [P] [US2] `steps/reducer.test.ts` — R1–R6: lock fires once at Mechanisms; touch build parity incl. error→null→advance; copy/adapt routing parity; unknown id is a no-op; editor purity (no editor calls these); store-state parity vs the pre-refactor inline path.

### SurveyView rewrite (remove the union)

- [ ] T028 [US2] Rewrite `SurveyView` in `packages/studio/src/StudioShell.tsx` (~517 LOC): read step order from `steps/manifest.ts`, drive transitions via the manifest + `applyStepCompletion`, and **delete the `SurveyStage` union** (FR-009, M1). Editors stay pure (FR-003).
- [ ] T029 [P] [US2] Update `packages/studio/src/StudioShell.test.tsx` — assert no `SurveyStage` symbol remains; runtime order equals manifest order; reordering two manifest steps changes runtime order (US2 independent test, SC-003).

### Dashboard rename + manifest source

- [ ] T030 [US2] Rename `packages/studio/src/flowmap/` → `dashboard/`: `FlowMapView.tsx`→`DashboardView.tsx`, `buildFlowGraph.ts`→`buildStepGraph.ts`; move `FlowGraphView/ScriptRoutingView/StrategyTreeView/buildScriptRouting/flowUtils/layout/model/tokens` + tests/snapshots. Preserve explicit import extensions (boundaries constraint).
- [ ] T031 [US2] Point `dashboard/buildStepGraph.ts` at `steps/manifest.ts` so every manifest step (galleries + panels included) yields exactly one node; keep the existing modular-registry resolution for question bodies (D7, C8).
- [ ] T032 [P] [US2] `dashboard/buildStepGraph.test.ts` — C8 (one node per step, node/edge set == runtime step set, zero ghost/missing) and C9 (same manifest as runtime; no second source). Update flow-map snapshots.
- [ ] T033 [US2] Add `steps-layer` and `dashboard-layer` rules to `.dependency-cruiser.cjs` per [contracts/boundaries.contract.md](contracts/boundaries.contract.md) (`steps/`→survey/editors/contracts/ui only; `dashboard/`→steps/contracts/ui only). Confirm `pnpm depcruise` green (B3, B4).

**Checkpoint**: ordering comes only from the manifest; map == runtime; side effects in the reducer. US2 testable.

---

## Phase 6: User Story 3 — Honest completeness/staleness (Priority: P2) — PR2 / P4b

**Goal**: the five distinct §3.5 checks over the manifest graph, plus the staleness store slice.

**Independent Test**: a crafted-violation manifest fixture trips each invariant in turn; a clean manifest passes all five.

- [ ] T034 [US3] `dashboard/completeness.ts` — `computeStaleness(graph, reopened)`: transitive closure to a **fixpoint** over `writes → inputs` (C1, FR-014).
- [ ] T035 [US3] Add `findCycles(graph)` to `dashboard/completeness.ts` — detect cycles in `writes → inputs`; non-empty ⇒ hard error (C2, FR-015).
- [ ] T036 [US3] Add `checkRejoin(manifest)` — every `spine:false` chain has a `joinTarget` whose terminal `next` reaches a `spine:true` step (C3, FR-016).
- [ ] T037 [US3] Add `checkSpinePrefixShippability(manifest, wc)` — **structural proxy**: each spine prefix leaves a complete, lock-consistent working copy; **no validator invocation** (C4, FR-017, Clarifications 2026-06-27).
- [ ] T038 [US3] Add `checkInputsSatisfiable(graph)` (orphan inputs, C5/FR-018), `runCompleteness(...)` aggregate, and `unreachable` detection (C7). Returns `CompletenessReport` (data-model).
- [ ] T039 [P] [US3] `dashboard/completeness.test.ts` — C1 (2-edge-distant dependent included), C2 (A→B→A is a cycle), C3 (off-spine dead-end flagged, rejoining one not), C4 (stranded-lock prefix flagged, clean not, no validator), C5 (orphan input, distinct from C4 both directions), C6 (real manifest passes all five), C7 (unreachable surfaced). (SC-006)
- [ ] T040 [US3] Add the `staleness` slice to `packages/studio/src/stores/workingCopyStore.ts`: `staleSteps: Set<string>` default empty ("fresh"), `markStale(reopenedId)` (recompute closure), `clearStale(stepId)` (FR-019, D5).
- [ ] T041 [P] [US3] `stores/workingCopyStore.test.ts` — default fresh; breaking a lock populates `staleSteps` with the closure; re-answering clears it and recomputes dependents.
- [ ] T042 [US3] Wire `dashboard/DashboardView.tsx` to surface the `CompletenessReport` read-only (stale/cycles/rejoin/unshippable/orphans/unreachable). Reuse existing UI; no new authoring UI (FR-023).

**Checkpoint**: completeness checks ship; staleness tracked. US3 testable.

---

## Phase 7: Polish & Cross-Cutting Concerns — PR2 / P4b

- [ ] T043 [P] Run [quickstart.md](quickstart.md) full P4a + P4b validation recipes; confirm `pnpm typecheck`, studio tests, and `pnpm depcruise` all green; spot-check end-to-end spine run + spine-prefix shippability (SC-007).
- [ ] T044 [P] Update [docs/survey-modularity-cyoa-plan.md](../../docs/survey-modularity-cyoa-plan.md) status banner/§6 to mark P4a + P4b shipped; cross-link the PRs (no issue numbers in code — Constitution VIII).
- [ ] T045 Verify SC-009 revert-safety: confirm reverting the PR2 SurveyView/manifest commit restores the union-driven flow without touching `editors/` (document the check; do not actually revert).

---

## Dependencies & Execution Order

### Phase / PR dependencies

- **Setup (P1)** → **Foundational (P2, `steps/types.ts`)** blocks everything.
- **US1 (P3)** and **US4 (P4)** depend only on Foundational; both ship in **PR1 (P4a)**. US4 is independent of US1 and can run in parallel with it.
- **US2 (P5)** depends on US1 (the manifest references the US1 editor adapters) → **PR2 (P4b)**.
- **US3 (P6)** depends on US2 (it reads the manifest + dashboard) → **PR2 (P4b)**.
- **Polish (P7)** depends on US2 + US3.

### Story dependencies (the one cross-story edge that matters)

- US2 → needs US1's adapters to register editor-steps. This is why the two-PR order is also the dependency order.
- US1, US4 independent of each other. US3 builds on US2.

### Within a story

- Moves (T005–T009) before adapters (T010–T013) before wiring (T014).
- Register adapters + manifest (T022–T024) before the SurveyView rewrite (T028).
- Reducer (T026) before/with the rewrite (T028).
- Completeness functions (T034–T038) before their aggregate test (T039); staleness slice (T040) supports T037/T042.

---

## Parallel Opportunities

- **Setup**: T002 [P] alongside T001.
- **US1 adapters**: T010, T011, T012, T013 all [P] (different files) once moves (T005–T009) land.
- **US1**: T008 [P] (splash/preview move) parallel to other moves; T016 [P] verification parallel to T017.
- **US4**: T018, T019 [P]; T021 [P] after T018–T020.
- **US2**: T025 [P] (manifest test), T027 [P] (reducer test), T029 [P] (shell test), T032 [P] (graph test) each parallel to the next implementation task.
- **US3**: T039 [P] and T041 [P] parallel; completeness functions T034–T038 are sequential (same file).
- **Polish**: T043, T044 [P].

---

## Parallel Example: US1 adapters

```bash
# After T005–T009 (moves) land, build the adapters together:
Task: "editors/adapters/carveAdapter.tsx"          # T010
Task: "editors/adapters/addPhysicalAdapter.tsx"    # T011
Task: "editors/adapters/addTouchAdapter.tsx"       # T012
Task: "editors/adapters/panelAdapters.tsx"         # T013
```

---

## Implementation Strategy

### PR1 (P4a) — MVP

1. Phase 1 Setup → Phase 2 Foundational (`steps/types.ts`).
2. Phase 3 US1 (moves → adapters → wire behind `SurveyStage` → boundaries → parity tests).
3. Phase 4 US4 (reserved seams).
4. **STOP & VALIDATE**: quickstart "P4a validation" — byte-identical, depcruise green, `SurveyStage` still drives. Merge PR1.

### PR2 (P4b) — the cutover

1. Phase 5 US2 (register adapters → manifest → reducer → SurveyView rewrite removing the union → dashboard rename + manifest source → boundary rules).
2. Phase 6 US3 (five completeness checks → staleness slice → dashboard surfacing).
3. Phase 7 Polish (quickstart full run, docs status, revert-safety check). Merge PR2.

### KM-crew dispatch (next)

`/speckit-taskstoissues` to create the issues, then `/km-lead` — `km-frontend` for the moves/adapters/SurveyView rewrite, `km-programmer` for steps/reducer/completeness/store, `km-validator` for the depcruise rules + completeness invariants, `km-testing` for parity + fixture suites, `km-archivist` to reconcile ACs at each PR close.

---

## Notes

- [P] = different files, no incomplete-task dependency.
- Every move preserves explicit `.ts`/`.tsx` import extensions (Bundler resolution; §8).
- No `Pattern`/IR-spine/validator/VirtualFS contract changes; `mutate()` stays a stub (P5).
- Commit per task or logical group; keep PR1 and PR2 as separate, independently-revertible PRs.
- Spine-prefix shippability is a structural proxy this phase — no validator invocation (Clarifications 2026-06-27).

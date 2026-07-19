# Tasks: Generic StepHost — SurveyView hand-placement dies

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Branch**: `km/qu-028-generic-step-host`
**Stage**: 5 of the Unified Survey Architecture refactor (master-plan D5 + D7).

Tests ARE requested here — the golden-walk parity oracle is the release gate (SC-001), and the
spec explicitly calls for it. Test tasks are first-class and, per the parity-first rule, the
golden-walk fixtures MUST be recorded and committed against the **pre-refactor** tree BEFORE any
StepHost change.

All paths are under `packages/studio/`.

---

## Phase 1: Setup

- [x] T001 Confirm branch `km/qu-028-generic-step-host` is forked from `main` with spec 027
      (Stage 4) merged; run `pnpm install` and `pnpm --filter @keyboard-studio/studio test` to
      establish a green baseline before any change.

---

## Phase 2: Foundational — parity oracle recorded FIRST (blocks all refactor work)

**This phase must complete, be committed, and be GREEN against the current (pre-refactor) tree
before any Phase 3+ task touches StepHost.** This is the auditable "recorded on main" oracle.

- [x] T002 Add the golden-walk RTL harness that drives a scripted survey run and records the
      ordered sequence `Array<{ stepId, applyStepCompletion: string[], storeMutations: string[],
      navigateTo: string[] }>` in `src/__tests__/stepHost.goldenWalk.test.tsx` (or the package's
      test dir). Instrument by spying on `applyStepCompletion`, the session/working-copy store
      mutators, and `navigateTo` — do NOT snapshot DOM.
- [x] T003 [P] Record the **copy-track** fixture from the current tree into
      `src/__tests__/__fixtures__/goldenWalk/copy.json` and assert the harness reproduces it.
- [x] T004 [P] Record the **adapt-track** fixture from the current tree into
      `src/__tests__/__fixtures__/goldenWalk/adapt.json` and assert `project_name` never appears.
- [x] T005 Run `pnpm --filter @keyboard-studio/studio test stepHost.goldenWalk` — confirm GREEN
      against pre-refactor code. **Commit T002–T005 alone**:
      `test(studio): golden-walk parity fixtures for survey traversal (spec 028)`.

**Checkpoint**: parity oracle exists and is committed. The refactor may now begin; this test
stays UNMODIFIED through Phase 3–5 and must remain green.

---

## Phase 3: User Story 1 + User Story 2 — the refactor, proven by parity (Priority: P1)

**Goal**: Copy-track and adapt-track authors walk the survey with byte-identical behaviour after
hand-placement is replaced by the generic host + advance policy.
**Independent test**: `stepHost.goldenWalk` (both fixtures) replays with zero diff (SC-001).

> US1 and US2 are implemented together because they share one code path (the advance policy's two
> fork branches). The two fixtures are the separate independent tests.

### Advance policy (pure)

- [x] T006 [P] [US1] Create `src/steps/advance.ts`: move `manifestIndexOf` + `nextSpineStepAfter`
      out of `StudioShell.tsx` and add `advance(completedStepId, result, ctx): AdvanceOutcome`
      with `AdvanceContext { selectedTrack, identitySupported }` and `AdvanceOutcome { next,
      navigate? }` per [contracts/advance-and-stephost.contract.md](./contracts/advance-and-stephost.contract.md).
      Import ONLY `./manifest.ts` + types (no stores/lib/components).
- [x] T007 [P] [US1] Create `src/steps/advance.test.ts` covering every case in contract §1:
      copy/adapt fork at `track`, `project_name→characters`, `identity` supported/unsupported,
      `help→done`+navigate, and each spine hop (skipping `spine:false`). Include an
      adapt-skips-`project_name` assertion (US2).

### Real adapters (identity + help + mechanisms self-sourcing)

- [x] T008 [P] [US1] Add `IdentityLiteAdapter` to `src/editors/adapters/panelAdapters.tsx`:
      satisfies `EditorStepProps`, reads `surveyContext` + derives `findingsByQuestionId` from the
      `validatorFindings` store bridge, and on completion writes `setIdentityResult` +
      `setSurveyContext` (the identity-specific effect, per research R7) then calls
      `onComplete(surveyPhaseResult)`.
- [x] T009 [P] [US1] Add `PhaseFAdapter` to `src/editors/adapters/panelAdapters.tsx`: reads
      `surveyContext` + `findingsByQuestionId` from the store bridge, emits the Phase F
      `SurveyPhaseResult` via `onComplete`. (SUPERSEDED & CLOSED: spec 029 Stage 6 replaces the bespoke PhaseFAdapter with the `makeFlowStepComponent` factory + `phase_f_helpdocs` option record in `flowStepOptions.tsx`; the adapter approach was intentionally not built — no residual work.)
- [x] T010 [P] [US1] Move `usePlacementPriors()` into the mechanisms adapter
      (`src/editors/adapters/addPhysicalAdapter.tsx`) so it self-sources `placementMap` instead of
      receiving it as a prop.
- [x] T011 [US1] Point the manifest at the real components: in `src/steps/registerEditorSteps.ts`
      set `identityStep.component = IdentityLiteAdapter` and `helpStep.component = PhaseFAdapter`
      (replacing the `TrackOneIdentityPanelAdapter` placeholders). Keep declared `inputs`/`writes`/
      `flowRefs` unchanged.

### Generic host

- [x] T012 [US1] Create `src/components/StepHost.tsx` per contract §2: reads `activeStepId`;
      handles `done`/`unsupported` terminals first (survey-complete panel / `UnsupportedScriptStub`
      + `onStartOver`); otherwise resolves `manifest.find(...)` and renders `step.component` with
      the generic `onComplete`/`onBack`/`ctx`; selects full-screen vs pane chrome by `step.layout`;
      keeps the unknown-id error panel. No per-step conditional.
- [x] T013 [US1] Implement the centralized completion path inside StepHost: shape-guarded
      `recordPhase` + `routeAnswersThroughMutate`, then `applyStepCompletion(step.id, result,
      reducerDeps)`, then `advance(...)` → `session.advance(next)`, then `navigateTo("output")` when
      `navigate === "output"`. `onBack = session.popHistory`.

### Shell shrink (StudioShell.tsx / SurveyView)

- [x] T014 [US1] In `src/StudioShell.tsx`, delete the three full-screen early returns
      (carve/mechanisms/touch), the `renderQuestionsPane` switch, and all ~15 per-step
      `handle*Complete`/`handle*Back` handlers + inline fork logic. Render `<StepHost
      reducerDeps={reducerDeps} onStartOver={handleStartOver} ctx={surveyContext} />` inside the
      pane/full-screen shell, letting StepHost pick the container.
- [x] T015 [US1] Keep in SurveyView (FR-009): resizable panes, OSK right pane, the single
      `useValidator` call site + V3 store bridge, `oskMode`, the pattern-map projection effect, the
      `instantiatedRef` double-instantiation guard, `onInstantiate`, and `ReducerDeps` construction.
      Verify no second `useValidator`/debounce was introduced.
- [x] T016 [US1] Update `validateManifestShape` in `StudioShell.tsx`: the `layout:"full"` guard
      is now load-bearing (drives StepHost chrome) rather than a temporary Stage-0 assertion —
      adjust the comment; keep the assertion.

### Parity + smoke

- [x] T017 [US1] Run `stepHost.goldenWalk` (T002 test, unmodified) — copy fixture zero diff (US1).
- [x] T018 [US2] Confirm `stepHost.goldenWalk` adapt fixture zero diff and `project_name` skipped.
- [x] T019 [P] [US1] Update existing `StudioShell.test.tsx`, `dashboard/trackRouting.test.ts`, and
      any prefill-routing / `CharactersStep` tests for the new mount plumbing ONLY — no behavioural
      assertion weakened (SC-002).

**Checkpoint**: both forks green via golden walk; existing suites green. US1 + US2 delivered.

---

## Phase 4: User Story 3 — manifest-only step changes (Priority: P2)

**Goal**: A maintainer changes layout / order / component by editing only the manifest.
**Independent test**: per-step render smoke shows correct component + chrome with no host branch.

- [x] T020 [US3] Create `src/__tests__/stepHost.renderSmoke.test.tsx`: for each manifest step id,
      mount `StepHost` at that step and assert the declared component renders in the correct chrome
      (full-screen for `layout:"full"`; two-pane otherwise), plus the two terminals render their
      panels. Assert declared component === mounted component for all ids (SC-005).
- [x] T021 [US3] Add a guard test (or extend manifest-shape tests) asserting SurveyView contains
      no per-step render branch / completion handler — e.g. assert `renderQuestionsPane` and the
      `handle*Complete` symbols are gone (SC-004).

---

## Phase 5: Polish & cross-cutting

- [x] T022 [P] Run full gates: `pnpm typecheck`, `pnpm --filter @keyboard-studio/studio test`,
      `pnpm depcruise` (confirm `steps/advance.ts` imports no stores/lib/components), and the Flow
      Map drift guardrail test (must be unchanged — SC-006).
- [x] T023 [P] Update `docs/architecture.md` / `docs/workflow-model.md` where they describe survey
      rendering to reflect the generic-host model; note Stage 6 (FlowStepHost factory) as the
      remaining follow-up. Keep the master-plan file's Stage 5 line accurate. (DONE: docs/workflow-model.md §6 landed in spec 029; docs/architecture.md "Generic step host" spine bullet added — StepHost manifest model + FlowStepHost/makeFlowStepComponent convergence, cross-linked to specs 028/029. Stage 6 is landed, so recorded as complete rather than a pending follow-up.)
- [x] T024 Final review pass (km-qc / km-synthesis): confirm no dead code left in SurveyView,
      adapters are DRY, and the completion path matches per-handler behaviour one-to-one.

---

## Dependencies & execution order

- **Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5** in order.
- **Phase 2 (T002–T005) is a hard gate**: the golden-walk oracle must be committed against the
  pre-refactor tree before Phase 3 begins. This is non-negotiable (parity provenance).
- Within Phase 3: T006/T007 (advance policy) and T008/T009/T010 (adapters) are parallelizable
  `[P]` (different files). T011 depends on T008/T009. T012/T013 (host) depend on T006 + the
  adapters. T014/T015/T016 (shell) depend on T012/T013. T017/T018 depend on the shell shrink.
- Phase 4 depends on the host existing (T012).

## Parallel opportunities

- T003 ‖ T004 (two fixtures, different files).
- T006/T007 ‖ T008 ‖ T009 ‖ T010 (advance policy and the three adapters are independent files).
- T019 ‖ T022 ‖ T023 once the refactor lands.

## Independent test criteria

- **US1 (copy parity)**: `stepHost.goldenWalk` copy fixture zero diff (T017).
- **US2 (adapt parity)**: `stepHost.goldenWalk` adapt fixture zero diff, `project_name` skipped (T018).
- **US3 (manifest-only edits)**: `stepHost.renderSmoke` correct component+chrome per id, no host
  branch (T020); no-per-step-handler guard (T021).

## Suggested MVP scope

Phase 2 + Phase 3 (US1 + US2): the parity-proven generic host + advance policy. This is the whole
release gate; US3's tests are the durability proof and land in the same PR.

## Format validation

All tasks use `- [ ] Txxx [P?] [USn?] description + file path`. Setup/Foundational/Polish carry no
story label; Phase 3 tasks carry `[US1]`/`[US2]`; Phase 4 carry `[US3]`.

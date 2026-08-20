# Tasks: FlowStepHost Convergence

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Contract**:
[contracts/flow-step-host.contract.md](./contracts/flow-step-host.contract.md) ·
**Branch**: `km/qu-029-flowstephost-convergence`
**Stage**: 6 of the Unified Survey Architecture refactor (master-plan Stage 6; follow-up to spec 028).

Tests ARE requested: the Stage-5 golden-walk parity oracle is the release gate (SC-001) and the
spec calls for a factory unit test (SC-006). Unlike Stage 5, the golden-walk fixtures are ALREADY
recorded on `main` — this stage does NOT re-record them; it MUST replay them unmodified.

All paths are under `packages/studio/`.

---

## Phase 1: Setup

- [x] T001 Confirm branch `km/qu-029-flowstephost-convergence` is forked from `main` (spec 028 /
      Stage 5 merged — `StepHost.tsx`, `steps/advance.ts`, and `__tests__/stepHost.goldenWalk.test.tsx`
      all present). Run `pnpm install` and `pnpm --filter @keyboard-studio/studio test` for a green
      baseline. Confirm the golden-walk copy + adapt fixtures exist and pass BEFORE any change.

---

## Phase 2: Foundational — the pure host (blocks the factory)

**No fixture re-recording**: the parity oracle already exists on `main`. This phase builds the
store-agnostic host that the factory and all three flows depend on.

- [x] T002 Create `src/survey/FlowStepHost.tsx` per contract §1: a pure component with
      `FlowStepHostProps` ([data-model.md](./data-model.md)) that renders the shared shell (dark
      container + blue `<h2>{title}</h2>`) and `<SurveyRunner key={flow.flow_id} flow={flow}
      context={context} onComplete={onComplete} …/>`, forwarding `onBack`/`getSeedValue`/
      `onAnswerCommit`/`findingsByQuestionId` ONLY when defined (C1.2). MUST NOT import
      `stores/`/`steps/flowSources`(runtime)/`dashboard/`/`lib/` (C1.3). Copy the exact markup from
      the current `PhaseTrack`/`PhaseProjectName`/`PhaseF` shell so no visual diff appears.
- [x] T003 Export `FlowStepHost` (+ its props type) from `src/survey/index.ts` (C1.4 — preserves the
      golden-walk `vi.mock("../survey/index.ts")` seam).

**Checkpoint**: the pure host compiles and is exported; no behaviour wired yet.

---

## Phase 3: User Story 1 + User Story 2 — the convergence, proven by parity (Priority: P1)

**Goal**: `track` / `project_name` / `phase_f_helpdocs` render through the factory over the pure
host with byte-identical behaviour; the three bespoke wrappers are deleted.
**Independent test**: `stepHost.goldenWalk` copy fixture (US1) and adapt fixture (US2) replay with
zero diff, fixtures unmodified.

> US1 and US2 share one code path (the factory + options records + the advance policy's two fork
> branches). The two fixtures are the separate independent tests.

### Factory + options records

- [x] T004 [US1] Create `src/editors/adapters/makeFlowStepComponent.tsx` per contract §2: factory
      taking `FlowStepOptions`, resolving `flowSources[options.flowRef]` (throw loudly if absent —
      C2.2/FR-010), `loadModularFlow(source.raw)` memoised (C2.3), reading store/hook `deps`, and
      rendering `<FlowStepHost>`. Completion wrapper (C2.4): `extract` → if `undefined` stay on step
      → `onCommit?.(extracted, deps)` → `props.onComplete(payload)`, in that order. ALL store access
      confined here (C2.5). Returns `React.ComponentType<EditorStepProps>` (C2.1).
- [x] T005 [US1] Create `src/editors/adapters/flowStepOptions.tsx` with the three options records per
      contract §3 + [data-model.md](./data-model.md) table: `track` (base_name context, track_choice
      extract, setSelectedTrack[+setScaffoldSpec(null) on adapt] onCommit, localBase-null guard),
      `project_name` (empty context, display+id extract, setScaffoldSpec+setIdentity onCommit,
      slugify seeds with Back→forward re-derivation, defaultDisplayName from identityResult), and
      `phase_f_helpdocs` (surveyContext context, identity extract, usesFindings via
      `buildFindingsByQuestionId`). Reproduce each wrapper's behaviour EXACTLY.

### Wire the manifest + delete the wrappers

- [x] T006 [US1] Update `src/steps/registerEditorSteps.ts` (C4.1/C4.2): point `trackStep.component`,
      `projectNameStep.component`, `helpStep.component` at the factory output for `track`/
      `project_name`/`phase_f_helpdocs`. Keep declared `inputs`/`writes`/`flowRefs` unchanged. Do NOT
      touch `identityStep` (IdentityLiteAdapter) or any gallery step (C4.3/R8).
- [x] T007 [US1] In `src/editors/adapters/panelAdapters.tsx`, remove the bespoke bodies of
      `TrackStepAdapter`/`ProjectNameStepAdapter`/`PhaseFAdapter` (now expressed as factory output /
      options records). Keep `IdentityLiteAdapter`, `BaseResolutionAdapter`, `ScaffoldFormAdapter`,
      `TrackOneIdentityPanelAdapter` untouched. Update any re-exports referenced by the manifest.
- [x] T008 [US1] Delete `src/survey/PhaseTrack.tsx`, `src/survey/PhaseProjectName.tsx`,
      `src/survey/PhaseF.tsx` and their exports from `src/survey/index.ts` (SC-003, C5.5).

### Parity + smoke

- [x] T009 [US1] Run `stepHost.goldenWalk` (unmodified) — copy fixture zero diff (SC-001, C5.1).
- [x] T010 [US2] Confirm `stepHost.goldenWalk` adapt fixture zero diff and `project_name` skipped
      (SC-001, C5.1).
- [x] T011 [P] [US1] Re-point existing behaviour tests at the factory output with assertions
      UNCHANGED: `src/survey/PhaseProjectName.integration.test.tsx` (slug seeding, Back→forward
      re-derivation) and any `PhaseTrack`/`PhaseF` behaviour specs. Update ONLY the mount/import
      plumbing; weaken NO assertion (SC-002, C5.2).

**Checkpoint**: both forks green via the golden walk; wrappers gone; existing suites green.
US1 + US2 delivered.

---

## Phase 4: User Story 3 — factory-only new-flow capability (Priority: P2)

**Goal**: mounting a YAML-driven step is a 3-artifact change (flowSources entry + manifest flowRefs +
one options record) with no bespoke component.
**Independent test**: the factory unit test proves resolve→run→extract→complete and a loud failure
for an unknown ref.

- [x] T012 [US3] Create `src/__tests__/makeFlowStepComponent.test.tsx` (SC-006, C5.3): mount
      `makeFlowStepComponent({ flowRef: "track", … })`, drive the runner to a "copy" completion, and
      assert `setSelectedTrack("copy")` fires before `onComplete({track:"copy"})`; assert the
      stay-on-step path when `extract` returns `undefined`; assert mounting with an unknown `flowRef`
      throws a descriptive error (no silent empty render).

---

## Phase 5: Polish & cross-cutting

- [x] T013 [P] Run full gates (SC-005, C5.4): `pnpm typecheck`, `pnpm --filter
      @keyboard-studio/studio test`, and `pnpm depcruise` — explicitly confirm the new
      `editors/adapters → steps/flowSources` runtime edge is acyclic and introduces no forbidden
      edge (R1). Confirm the Flow Map drift guardrail test is UNCHANGED and green.
- [x] T014 [P] Update `docs/workflow-model.md` (and `docs/architecture.md` if it describes survey
      rendering) to record that `track`/`project_name`/`help` render via the generic `FlowStepHost`
      factory; mark master-plan Stage 6 complete and note the "generated-from-flow" source is now
      fully realized (adding a YAML flow = flowSources entry + flowRefs + options record).
- [x] T015 Final review pass (km-qc / km-synthesis): confirm no dead code left in `survey/` or
      `panelAdapters.tsx`, the options records are DRY, and the completion/effect ordering matches the
      pre-refactor per-wrapper behaviour one-to-one (C2.4). Confirm SC-003 (zero bespoke wrappers) and
      SC-004 (3-artifact capability) hold.

---

## Dependencies & execution order

- **Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5** in order.
- Phase 2 (T002/T003) blocks the factory (T004 renders `FlowStepHost`).
- Within Phase 3: T004 (factory) + T005 (options) come first; T006/T007/T008 (wire + delete) depend
  on T004+T005; T009/T010/T011 (parity + tests) depend on the wiring landing.
- Phase 4 (T012) depends on the factory existing (T004).
- Phase 5 depends on the refactor landing.

## Parallel opportunities

- T011 ‖ T013 ‖ T014 once the refactor (T004–T008) lands.
- T004 and T005 are closely coupled (factory consumes the options shape) — treat as a pair, not
  parallel.

## Independent test criteria

- **US1 (copy parity)**: `stepHost.goldenWalk` copy fixture zero diff (T009).
- **US2 (adapt parity)**: `stepHost.goldenWalk` adapt fixture zero diff, `project_name` skipped (T010).
- **US3 (factory capability)**: `makeFlowStepComponent.test.tsx` — resolve→run→extract→complete +
  loud unknown-ref failure (T012).

## Suggested MVP scope

Phase 2 + Phase 3 (US1 + US2): the pure host + factory + options records + wrapper deletion, proven
by the parity oracle. This is the whole release gate; US3's factory test is the durability proof and
lands in the same PR.

## Format validation

All tasks use `- [ ] Txxx [P?] [USn?] description + file path`. Setup/Foundational/Polish carry no
story label; Phase 3 tasks carry `[US1]`/`[US2]`; Phase 4 carries `[US3]`.

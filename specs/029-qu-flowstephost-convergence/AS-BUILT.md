# Spec 029 FlowStepHost convergence: as built

**Status:** Retired 2026-09-29. Shipped in PR #983 (squash `e3536d7`, 2026-07-04); retroactively verified in #1677 (`d9439b9`). Tasks: 15/15 complete.
**Full docs:** [specs/_archive/029-qu-flowstephost-convergence/](../_archive/029-qu-flowstephost-convergence/) (spec, plan, tasks, research, data-model, contracts, checklists). Not read by default.
**Pinned here:** none

## What shipped
- The three bespoke survey wrappers `PhaseTrack`, `PhaseProjectName`, `PhaseF` are deleted and replaced by one option-driven `FlowStepHost` plus a `makeFlowStepComponent(options)` factory (Stage 6 of the Unified Survey Architecture; follow-up to spec 028).
- Per-flow behaviour lives in options records; the factory is the only place stores/hooks are touched.
- Behaviour parity proven by the spec 028 golden-walk oracle replayed unmodified.

## Public contracts (studio-internal)
- `FlowStepHost` -- [survey/FlowStepHost.tsx](../../packages/studio/src/survey/FlowStepHost.tsx), re-exported from `survey/index.ts` (keeps the golden-walk `vi.mock` seam). Pure presentational: shared shell + `<h2>` + `SurveyRunner`; forwards `onBack`, `getSeedValue`, `onAnswerCommit`, `findingsByQuestionId` only when defined. No imports of `stores/`, `lib/`, `dashboard/`.
- `makeFlowStepComponent<Extracted>(options: FlowStepOptions<Extracted>)` -- [editors/adapters/makeFlowStepComponent.tsx:204](../../packages/studio/src/editors/adapters/makeFlowStepComponent.tsx). Resolves `flowSources[options.flowRef]` and throws a descriptive Error if absent; memoised `loadModularFlow`. On completion: `extract(result)`; `undefined` means stay on the step; else `onCommit?.(extracted, deps)` BEFORE `props.onComplete(...)`.
- `FlowStepOptions` (`flowRef`, `extract`, `onCommit?`, context builder, seeds) and `FlowStepDeps` in the same file.
- Options records in [editors/adapters/flowStepOptions.tsx](../../packages/studio/src/editors/adapters/flowStepOptions.tsx): `trackOptions`, `projectNameOptions`, `phaseFOptions`.
- `registerEditorSteps.ts` binds `trackStep`, `projectNameStep`, `helpStep` to the factory output.

## Key decisions
- `FlowStepHost` in `survey/`, factory in `editors/adapters/`, so the pure shell stays store-free and depcruise-clean (research R1).
- R7 store-effect ordering (effects before `onComplete`) is expressed as an explicit `onCommit` hook, not implicit adapter code (R2).
- `project_name` seeding (slugify keyboard id, Back-then-forward re-derivation) moved verbatim into the options record (R3).
- `identity` is deliberately NOT converged: it uses the bespoke `IdentityLite` component (R8).

## Gotchas and limits
- `track.onCommit` must call `setSelectedTrack` before `onComplete`; `advance()` depends on it (spec 028).
- The `track` context builder renders nothing when `localBase` is null.
- `phaseFOptions` also carries later additions (help-doc store writes, spec 079 wiring); read the code, not the parity table.
- Tests live in `packages/studio/tests/steps/` (spec said `src/__tests__/`).

## Divergences from the spec
None found on the contract surface (C1.1-C1.4, C2.1-C2.4 all match the code).

## Follow-ups and open issues
- Docs pointing at the archived spec: [docs/architecture.md:68](../../docs/architecture.md) links `specs/029-.../spec.md`; retarget to this file.
- Stale "Draft" headers on landed specs were a noted follow-up in the convergence plan.

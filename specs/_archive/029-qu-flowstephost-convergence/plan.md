# Implementation Plan: FlowStepHost Convergence

**Branch**: `km/qu-029-flowstephost-convergence` | **Date**: 2026-07-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/029-qu-flowstephost-convergence/spec.md`

**Governing spec**: master-plan **Stage 6**, follow-up to [spec 028](../028-qu-generic-step-host/spec.md)
(which delivered the generic `StepHost` + `advance.ts` and named this factory as the deferred
Stage 6). Architectural home: `docs/workflow-model.md` (survey rendering), `spec.md` §8.

## Summary

Collapse the three near-identical survey wrappers — `PhaseTrack`, `PhaseProjectName`, `PhaseF` —
into ONE pure `FlowStepHost` component plus a `makeFlowStepComponent(flowRef, options)` factory. The
host renders the shared `<div><h2>{title}</h2><SurveyRunner …/></div>` body that all three wrappers
duplicate today; the factory binds a flow ref to a per-flow **options record**
(`{ title, buildContext, extract, seeds? }`) and folds in the step-specific store-mutation effects
the current adapters perform. The three wrapper components are deleted; `track` / `project_name` /
`help` mount points become factory calls. Parity is the hard gate: the Stage-5 `stepHost.goldenWalk`
copy + adapt fixtures replay with zero diff and stay byte-for-byte unmodified.

## Technical Context

**Language/Version**: TypeScript 5.x (studio package), React 18 + Vite.

**Primary Dependencies**: existing studio internals only — `SurveyRunner`, `loadModularFlow`,
`steps/flowSources.ts` (`FlowSource` registry), `@keyboard-studio/contracts` (`SurveyPhaseResult`,
`slugifyKeyboardId`), the two stores (`surveySessionStore`, `workingCopyStore`), and the
`lint/lintToQuestion.ts` findings bridge. No new dependency.

**Storage**: N/A (in-memory working copy; no persistence change).

**Testing**: vitest + React Testing Library. The parity gate is the existing
`src/__tests__/stepHost.goldenWalk.test.tsx` + fixtures (copy/adapt). Re-pointed behaviour tests:
`survey/PhaseProjectName.integration.test.tsx` and any `PhaseTrack`/`PhaseF` behaviour specs. One new
factory unit test.

**Target Platform**: Studio SPA (browser).

**Project Type**: Web SPA — single package `packages/studio`.

**Performance Goals**: N/A — pure refactor; same runtime path (one `SurveyRunner` mount per step).

**Constraints**:
- Dependency-cruiser boundaries. Critical fact: the `no-circular` rule exempts **type-only** imports
  but `steps/flowSources.ts` imports `survey/questions` registries at **runtime**. Therefore
  `survey/FlowStepHost.tsx` MUST NOT runtime-import `steps/flowSources` (would invert the
  steps→survey layering). Flow resolution + store effects live in the `editors/adapters/` layer,
  which is already permitted to import both `steps/` and `stores/` and is acyclic w.r.t.
  `flowSources` (flowSources has no back-edge into editors).
- `EditorStepProps` stays the single prop contract (FR-002, FR-009).
- Golden-walk fixtures unmodified (FR-007).

**Scale/Scope**: 3 wrappers deleted, 1 host + 1 factory + 3 options records added; ~5–7 files.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Article | Relevant? | Verdict |
|---|---|---|
| I. Pattern schema locked | No | No `contracts` / `Pattern` / schema edit (FR-009). PASS. |
| II. KeyboardIR spine | No | No codec / IR / parse change. PASS. |
| III. Single working copy | No | No instantiation/serialization change; same store writes, same order. PASS. |
| IV. Validator layering / single debounce | No | No new validator path or debounce timer; findings bridge is read-only (FR-006). PASS. |
| V. VirtualFS only | No | No host-disk write; no output-path change. PASS. |
| VI. Team boundaries | **Yes** | Engine team owns the SPA (spec §12). This is studio front-end work, fully within engine. PASS. |
| VII. Out of scope v1 | No | Touches none of the §16 list; explicitly excludes gallery/loop/mutate-seam/membership changes. PASS. |
| VIII. House conventions | **Yes** | ASCII console output, markdown links, no issue numbers in code, `feat(studio):`/`refactor(studio):` commit prefix. PASS. |

**Result: PASS, no violations, no Complexity Tracking entries required.** This is a
behaviour-preserving refactor whose correctness is machine-checked by the parity oracle.

## Project Structure

### Documentation (this feature)

```text
specs/029-qu-flowstephost-convergence/
├── plan.md              # This file
├── research.md          # Phase 0 — the layering/effect-placement decision
├── data-model.md        # Phase 1 — FlowStepHost props + options record shape
├── quickstart.md        # Phase 1 — how to verify parity + add a new flow
├── contracts/
│   └── flow-step-host.contract.md   # host + factory + options contract
└── tasks.md             # Phase 2 (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
packages/studio/src/
├── survey/
│   ├── FlowStepHost.tsx            # NEW — pure host (styled shell + SurveyRunner)
│   ├── PhaseTrack.tsx              # DELETED
│   ├── PhaseProjectName.tsx        # DELETED
│   ├── PhaseF.tsx                  # DELETED
│   ├── index.ts                    # CHANGED — export FlowStepHost; drop PhaseTrack/PhaseProjectName/PhaseF
│   ├── SurveyRunner.tsx            # UNCHANGED (consumed as-is)
│   └── loadModularFlow.ts          # UNCHANGED
├── editors/adapters/
│   ├── makeFlowStepComponent.tsx   # NEW — factory: resolve flowSources[ref] → FlowStepHost + effects
│   ├── flowStepOptions.tsx         # NEW — the three options records (track / project_name / phase_f)
│   └── panelAdapters.tsx           # CHANGED — TrackStepAdapter/ProjectNameStepAdapter/PhaseFAdapter
│                                   #   replaced by (or thinly delegate to) factory output
├── steps/
│   ├── flowSources.ts              # UNCHANGED (shape consumed, not modified)
│   └── registerEditorSteps.ts      # CHANGED — component fields point at factory output
└── __tests__/
    ├── stepHost.goldenWalk.test.tsx        # UNMODIFIED (parity gate)
    └── makeFlowStepComponent.test.tsx      # NEW — factory unit test
```

**Structure Decision**: Single-package studio change. The pure/impure split is the load-bearing
decision: presentation in `survey/` (store-agnostic), resolution + store effects in
`editors/adapters/` (the layer already permitted to touch `steps/` and `stores/`). This keeps the
`steps → survey` layering direction intact and depcruise green — see [research.md](./research.md).

## Complexity Tracking

Not applicable — Constitution Check passed with no violations.

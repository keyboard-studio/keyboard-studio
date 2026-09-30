# Implementation Plan: Generic StepHost — SurveyView hand-placement dies

**Branch**: `km/qu-028-generic-step-host` | **Date**: 2026-07-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/028-qu-generic-step-host/spec.md`

## Summary

Replace the survey component's hand-placement of every step (three full-screen early returns,
a `renderQuestionsPane` switch, ~15 completion/back handlers, inline fork logic) with a generic
`StepHost` that resolves each step's `component` and `layout` from the manifest, plus a pure
`steps/advance.ts` policy that encodes the copy/adapt fork, `joinTarget` hops, and
`done`/`unsupported` terminals. Make `identity`/`help` mount real adapters (no placeholders).
The parity oracle is a golden-walk RTL test recorded on the pre-refactor tree and committed
first. Pane scaffolding, the single validator call site, and the double-instantiation guard
stay in the survey component. Master-plan decisions D5 (walked-history back) and D7 (generic
host). Stage 6 (FlowStepHost factory) is out of scope.

## Technical Context

**Language/Version**: TypeScript 5.x, React 18, Vite (studio SPA).

**Primary Dependencies**: `@keyboard-studio/studio` internal — `surveySessionStore` (Stage 3),
`workingCopyStore`, `steps/manifest.ts`, `steps/reducer.ts` (`applyStepCompletion`,
`nextSpineStepAfter`, `ReducerDeps`), `steps/types.ts` (`Step`, `EditorStepProps`), existing
adapters (`panelAdapters.tsx`, gallery adapters), `survey/` components (`IdentityLite`,
`PhaseTrack`, `PhaseProjectName`, `PhaseF`, `CharactersStep`, `BaseResolution`), `usePlacementPriors`.

**Storage**: In-memory zustand stores only (VirtualFS authoring; no host-disk writes).

**Testing**: vitest + React Testing Library (`@keyboard-studio/studio` package). Golden-walk
fixtures committed under the spec/test tree. Analogue oracle: `wireGalleries` `emitByteOracle.test.ts`.

**Target Platform**: Browser SPA (studio).

**Project Type**: Web application (front-end refactor within the studio package).

**Performance Goals**: No new render cost; the single 300 ms validator debounce is preserved
(one `useValidator` call site). No second debounce/validation path.

**Constraints**: Byte-for-byte user-visible parity (SC-001 golden walk). Boundary compliance:
`steps/advance.ts` imports only manifest/types (no stores/lib); `components/StepHost.tsx` may
import stores/hooks. Flow Map drift guardrail node sets unchanged.

**Scale/Scope**: One package (`packages/studio`). ~10 manifest steps + 2 terminals. Net LOC
expected to *decrease* in `StudioShell.tsx` (handlers/switch removed) and appear in
`components/StepHost.tsx` + `steps/advance.ts` + new adapters + fixtures.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Article | Verdict | Notes |
|---------|---------|-------|
| I. Pattern schema locked | PASS | No contracts/schema change. `EditorStepProps` and `Step` types untouched (studio-local). |
| II. KeyboardIR spine | PASS | No codec/IR change. `applyStepCompletion` reducer unchanged; host calls it with the same deps. |
| III. Single working copy | PASS | No new working copy; `workingCopyStore` mutation path unchanged. `instantiatedRef` guard preserved (D4). |
| IV. Validator layering / one debounce | PASS | **Load-bearing**: exactly ONE `useValidator` call site stays in the survey component (FR-009). No second debounce. V3 store-bridge unchanged. |
| V. VirtualFS only | PASS | No host-disk writes; authoring stays in-memory. |
| VI. Team boundaries | PASS | Engine team owns the SPA/steps/host. `steps/advance.ts` obeys the steps-layer depcruise rule (imports no stores/lib). |
| VII. Out of scope v1 | PASS | `unsupported` terminal still renders the CJK/Ethiopic §9 stub (never empties the gallery). No new v1-scope features. |
| VIII. House conventions | PASS | No emoji in console; markdown links in docs; commit prefix `refactor(studio)`/`feat(studio)`; no issue numbers in code. |

**Post-Phase-1 re-check**: PASS (no design decision introduces a second debounce, a contracts
change, or a boundary violation — see research.md decisions R1–R7).

## Project Structure

### Documentation (this feature)

```text
specs/028-qu-generic-step-host/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (advance-policy + StepHost contracts)
├── checklists/
│   └── requirements.md  # spec quality checklist (from /speckit-specify)
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
packages/studio/src/
├── StudioShell.tsx                    # SurveyView shrinks here: pipeline hooks + panes + <StepHost/>
├── components/
│   └── StepHost.tsx                   # NEW — generic host (resolve component + chrome by layout)
├── steps/
│   ├── advance.ts                     # NEW — pure advance policy (fork, joinTarget, terminals)
│   ├── advance.test.ts                # NEW — advance-policy unit tests
│   ├── manifest.ts                    # identity/help components become real (via registerEditorSteps)
│   ├── registerEditorSteps.ts         # identityStep/helpStep → real IdentityLite/PhaseF adapters
│   └── reducer.ts                     # unchanged (nextSpineStepAfter may be reused by advance.ts)
├── editors/adapters/
│   ├── panelAdapters.tsx              # add IdentityLiteAdapter + PhaseFAdapter; adapters self-source ctx
│   └── (mechanisms adapter)           # usePlacementPriors moves in here
└── survey/
    └── (IdentityLite/PhaseF/etc.)     # unchanged components; adapters wrap them

packages/studio/tests/ (or src/**/__tests__)
├── stepHost.goldenWalk.test.tsx       # NEW — copy + adapt fixtures, committed BEFORE refactor
├── stepHost.renderSmoke.test.tsx      # NEW — per-step layout/component smoke
└── __fixtures__/goldenWalk/*.json     # NEW — recorded ordered walk sequences
```

**Structure Decision**: Single-package front-end refactor inside `packages/studio`. New units
are `components/StepHost.tsx` and `steps/advance.ts` (+ tests); adapters gain real
`IdentityLite`/`PhaseF` wrappers; `StudioShell.tsx`'s `SurveyView` loses its per-step branches.
No cross-package changes.

## Complexity Tracking

> No Constitution violations — this section intentionally empty.

The one subtlety worth flagging (not a violation): `steps/advance.ts` must stay in the
`steps/` layer (no stores import), so the advance policy takes the *session snapshot values it
needs* (e.g. `selectedTrack`) as plain arguments from the host, rather than reading the store
itself. The host (a component) reads the store and passes the snapshot in. This keeps the pure
policy testable and boundary-clean.

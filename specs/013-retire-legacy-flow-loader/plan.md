# Implementation Plan: Retire the legacy full-YAML survey flow loader

**Branch**: `013-retire-legacy-flow-loader` (suggested cycle branch: `km/retire-legacy-flow-loader`) | **Date**: 2026-06-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/013-retire-legacy-flow-loader/spec.md`

## Summary

Phase 3b of the Survey Modularity + CYOA plan. The survey **runtime** already resolves Phase A / F / identity-lite through `loadModularFlow` (Phase 3a, spec 012). The legacy `parseFlow` loader and its four full-flow YAMLs now survive only because the **flow-map / dashboard** still reads them for those three sections (Phase B already uses the modular path). 

Technical approach, in three independently revertible commits:
1. **Repoint** the flow map's Phase A / F / identity-lite sections (and the script-routing view) from the legacy `parseFlow` + `*.yaml` to `loadModularFlow` + `*.modular.yaml` + the phase registries — generalizing `buildModularFlowGraph` to accept the registry it should compute reserve nodes against. This is the gating work (US1, P1).
2. **Delete** `survey/loadFlow.ts` + `loadFlow.test.ts` (US2).
3. **Delete** the four legacy full-flow YAMLs, keeping `*.modular.yaml` + `_examples/*` (US3).

No question research content is touched (plan §3.8). No engine/contracts change.

## Technical Context

**Language/Version**: TypeScript 5.x (strict, Bundler resolution with explicit `.ts`/`.tsx` import extensions), Node ≥ 20

**Primary Dependencies**: React 18 + Vite (studio SPA); Vitest (tests); Vite `?raw` import for flow YAML; dependency-cruiser (boundary lint). Repointed code reuses the existing `loadModularFlow`, the phase registries (`phaseARegistry` / `phaseFRegistry` / `phaseBRegistry`), and `buildGraphFromQuestions`.

**Storage**: N/A — in-memory flow graphs; flow sources are static `content/flows/*.modular.yaml` assets.

**Testing**: Vitest (`pnpm --filter @keyboard-studio/studio test`). Affected: `flowmap/buildFlowGraph.test.ts` (retarget legacy-YAML fixtures to modular manifests), `loadFlow.test.ts` (deleted). Existing `tests/survey/flow-parity.test.ts` (Phase 3a golden harness) remains green and is the parity precedent.

**Target Platform**: Browser SPA (developer "Flow Map" tab).

**Project Type**: Web SPA within a pnpm monorepo (`packages/studio`).

**Performance Goals**: N/A — pure refactor/deletion; flow-graph build is a one-time `useMemo` on a handful of small manifests.

**Constraints**: Strict-TS explicit-extension imports must be preserved on every changed import (spec plan §8). A dangling `?raw` import of a deleted YAML is a build-time error — every legacy import must be removed in lockstep with the file. No second debounce/validation path is introduced.

**Scale/Scope**: 6 files deleted (1 loader + 1 loader test + 4 YAMLs); ~4 files edited (`FlowMapView.tsx`, `buildFlowGraph.ts`, `buildScriptRouting.ts`, `buildFlowGraph.test.ts`). 0 question modules touched.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Article | Gate | Verdict |
|---------|------|---------|
| I. Pattern schema locked | Does this rename/retype/remove a `Pattern` field or its zod schema? | **PASS** — untouched. No `packages/contracts` change. |
| II. KeyboardIR is the engine spine | Does this operate on raw `.kmn` or bypass the IR? | **PASS** — N/A; this is survey-flow / flow-map code, no codec/IR involvement. |
| III. Single persistent working copy | Does this add a second working copy or intermediate serialization? | **PASS** — N/A; no working-copy interaction. |
| IV. Validator layering / single 300 ms debounce | Does this add a second debounce or parallel validation path? | **PASS** — no validator/debounce code touched. |
| V. VirtualFS only during authoring | Does authoring write to host disk? | **PASS** — N/A; flow sources are static build assets read via `?raw`. |
| VI. Team boundaries (§12/§13) | Which team owns this, and does it stay in bounds? | **PASS** — **Engine team** (SPA / flow map / survey loader). No content-owned asset (pattern library, survey text, gallery ordering, prompts, criteria) is altered; the `*.modular.yaml` manifests and question modules are left intact. |
| VII. Out of scope for v1 | Does this implement any §16 forbidden item? | **PASS** — none; pure retirement. |
| VIII. House conventions | Commit/issue titles, no emoji, markdown-link file refs, no issue numbers in code. | **PASS** — commits use `maint(studio)` / `refactor(studio)` prefixes; deletion commits carry no shipped-code issue numbers. |

**Result: PASS — no violations.** Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/013-retire-legacy-flow-loader/
├── plan.md              # This file
├── research.md          # Phase 0 — repoint decisions
├── data-model.md        # Phase 1 — file inventory + FlowSourceEntry shape
├── quickstart.md        # Phase 1 — verification guide
├── contracts/
│   └── flow-graph-parity.md   # node/edge parity + buildModularFlowGraph signature contract
└── tasks.md             # Phase 2 — created by /speckit-tasks (NOT here)
```

### Source Code (repository root)

```text
packages/studio/src/
├── flowmap/
│   ├── FlowMapView.tsx          # EDIT — drop 3 legacy *.yaml?raw imports; all sections use modular loader
│   ├── buildFlowGraph.ts        # EDIT — generalize buildModularFlowGraph(raw, title, registry);
│   │                            #        remove legacy buildFlowGraph() + parseFlow import
│   ├── buildScriptRouting.ts    # EDIT — parseFlow → loadModularFlow on identity_lite.modular.yaml
│   ├── buildFlowGraph.test.ts   # EDIT — retarget legacy-YAML fixtures to modular manifests
│   ├── ScriptRoutingView.tsx    # (likely unchanged — still receives identity-lite raw string prop)
│   └── …                        # FlowGraphView, model, flowUtils, tokens — unchanged
└── survey/
    ├── loadFlow.ts              # DELETE (US2)
    ├── loadFlow.test.ts         # DELETE (US2)
    ├── loadModularFlow.ts       # surviving loader — unchanged
    └── questions/registry.*.ts  # phaseARegistry / phaseFRegistry / phaseBRegistry — unchanged

content/flows/
├── phase_a_identity.yaml        # DELETE (US3)
├── phase_b_characters.yaml      # DELETE (US3)
├── phase_f_helpdocs.yaml        # DELETE (US3)
├── identity_lite.yaml           # DELETE (US3)
├── *.modular.yaml               # KEEP (4 manifests)
└── _examples/*                  # KEEP (fixtures)
```

**Structure Decision**: No new directories. All edits land in the existing `packages/studio/src/flowmap/` (Engine-owned SPA) plus deletions in `packages/studio/src/survey/` and `content/flows/`. The repoint reuses existing modular plumbing (`loadModularFlow`, the phase registries, `buildGraphFromQuestions`, `computeReserveNodes`) rather than adding new abstractions.

## Complexity Tracking

> No Constitution Check violations — section intentionally empty.

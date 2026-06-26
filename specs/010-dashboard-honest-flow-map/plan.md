# Implementation Plan: Dashboard-honest flow map (P0)

**Branch**: `010-dashboard-honest-flow-map` | **Date**: 2026-06-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/010-dashboard-honest-flow-map/spec.md`

> **Pointer note.** `.specify/feature.json` currently points at `specs/011-ui-primitives` (a concurrent P1 session). This plan was authored **in isolation** directly into `specs/010-…/` without disturbing that shared pointer (maintainer decision, 2026-06-26). Downstream `/speckit-tasks` must be told to target `010` explicitly (or have the pointer flipped to `010` for the duration of that run, then restored).

## Summary

Make the studio flow map derive its graph from **what actually runs**, not from a parallel YAML copy. Today `flowmap/FlowMapView.tsx` feeds `buildFlowGraph(raw, title)` the legacy `content/flows/*.yaml` via `parseFlow` for **all** phases — including Phase B, whose true runtime source is the modular registry resolved through `phase_b_characters.modular.yaml` (`loadModularFlow`). P0 repoints the **Phase B** graph at the modular registry/manifest so the rendered node set equals the live runtime step set (no ghost/missing nodes), while A/F/identity-lite keep building from their legacy YAML **because that YAML is still their runtime source** until P3 — so the map is honest per phase, by construction.

Technical approach: the existing graph-building core in `buildFlowGraph.ts` already operates on `FlowQuestion[]`, and `loadModularFlow(raw)` returns the same `FlowDef`/`FlowQuestion[]` shape as `parseFlow`. So the core is loader-agnostic — extract it to take parsed questions, then add a thin modular adapter for Phase B. On top of that: (a) emit **stub nodes** for the galleries and the five hand-built wizard steps in a separate "not-yet-ordered" region (FR-005/FR-007); (b) emit **"library / not-in-flow"** nodes for registered Phase B modules the manifest does not reference (FR-008, = `phaseBRegistry` keys − manifest IDs); (c) add the **verification** check: a derived-equality assertion of the live node set against the registry-resolved manifest plus an edge/label snapshot (FR-010). The viewer stays read-only (FR-009); no authoring affordance ships (that is the deferred [009](../009-flow-map-editor/spec.md) editor).

**Scope nuance to flag at task time:** FR-008 (showing reserve modules as distinguished nodes) pulls a thin slice of §3.7 library-surfacing *forward* relative to the plan doc's "minimal P0." It is small and read-only, but it is a deliberate, clarified addition (Clarifications 2026-06-26), not the bare minimum the plan doc describes.

## Technical Context

**Language/Version**: TypeScript 5.x (strict, Bundler resolution with explicit `.ts`/`.tsx` import extensions)

**Primary Dependencies**: React + Vite (the `@keyboard-studio/studio` SPA); existing `flowmap/` rendering (`FlowGraphView.tsx`, `layout.ts`, `model.ts`, `tokens.ts`); `survey/loadModularFlow.ts`; `survey/questions/registry.b.ts` (`phaseBRegistry`). YAML `?raw` imports for flow sources.

**Storage**: N/A — in-memory graph derived at render; no persistence. (VirtualFS untouched.)

**Testing**: vitest (`pnpm --filter @keyboard-studio/studio test`). New: derived-equality unit test + edge/label snapshot for the Phase B graph. Playwright E2E is out of scope for P0 (the two E2E lanes belong to #410/P3).

**Target Platform**: Browser SPA (read-only flow-map viewer).

**Project Type**: Web SPA (frontend single package, `packages/studio`).

**Performance Goals**: Graph build is synchronous and small (tens of nodes); no perf target beyond "renders without noticeable delay." Verification test runs as a fast unit/snapshot test (no E2E harness).

**Constraints**: Read-only (no authoring). Must not fall back to legacy YAML on a failed modular load (FR-011 — fail visible). Must preserve explicit import extensions on any new/moved imports. No second debounce/validation path introduced.

**Scale/Scope**: 1 package (`packages/studio/src/flowmap/`). ~55 live Phase B modules + the reserve remainder; 3 galleries + 5 wizard steps as stubs.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Article | Verdict | Notes |
|---|---|---|
| I. Pattern schema locked | PASS | No `Pattern`/`Criterion` type or schema touched. |
| II. KeyboardIR is the engine spine | PASS | Read-only map; no `.kmn`/IR parse, emit, or mutation. No opaque-fragment handling involved. |
| III. Single persistent working copy | PASS | No working-copy instantiation or serialization; the map does not write IR. |
| IV. Validator layering fixed (one 300 ms debounce) | PASS | No validator code, no new debounce/validation path. |
| V. VirtualFS only during authoring | PASS | No host-disk writes; map is a derived in-memory view rendered in the SPA. |
| VI. Team boundaries (§12/§13) | PASS (with note) | **Engine team owns this** (SPA/flowmap infrastructure; `km-frontend`). It *reads* content (survey questions, gallery identity) but changes no survey text or gallery ordering — Content's surface is untouched. FR-008's library-node *rendering* is presentation, not ordering. |
| VII. Out of scope for v1 | PASS | Implements none of the forbidden list. The map must keep rendering the CJK/Ethiopic "not yet supported" routing honestly (never silently empty the gallery) — consistent with this article. |
| VIII. House conventions | PASS | No emoji in any console/log output; markdown links in docs; no GitHub issue numbers in shipped code/comments (cross-link via PR body); commit titles `feat(studio): …` / `refactor(studio): …`. |

**No violations.** Complexity Tracking left empty. The FR-008 scope nuance is a clarified read-only addition, not a constitution violation.

## Project Structure

### Documentation (this feature)

```text
specs/010-dashboard-honest-flow-map/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions on loader-agnostic core, stub source, verification shape
├── data-model.md        # Phase 1 — node/edge/region entities and the live-vs-library-vs-stub kinds
├── quickstart.md        # Phase 1 — how to run + verify the honest map
├── contracts/
│   └── flow-graph.md    # Phase 1 — the graph node/edge contract + verification contract
└── tasks.md             # Phase 2 (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
packages/studio/src/
├── flowmap/
│   ├── FlowMapView.tsx          # EDIT: Phase B source switches from phase_b_characters.yaml?raw
│   │                            #   to the modular manifest + registry; A/F/identity-lite unchanged
│   ├── buildFlowGraph.ts        # REFACTOR: extract a loader-agnostic core over FlowQuestion[];
│   │                            #   keep the parseFlow path; add a loadModularFlow path
│   ├── buildFlowGraph.test.ts   # EDIT/ADD: derived-equality test (live node set == registry∩manifest)
│   ├── model.ts                 # EDIT: extend node kind to mark live | library-not-in-flow | stub,
│   │                            #   and a "region" grouping for not-yet-ordered stubs
│   ├── FlowGraphView.tsx        # EDIT (presentation): render library/stub kinds + the region distinctly
│   ├── layout.ts / tokens.ts    # EDIT if needed for the not-yet-ordered region styling/placement
│   └── (snapshot fixture)       # ADD: edge/label snapshot for the Phase B graph
├── survey/
│   ├── loadModularFlow.ts       # REUSE (no change expected): returns FlowDef from the modular manifest
│   └── questions/registry.b.ts  # REUSE (read): phaseBRegistry → reserve set = keys − manifest IDs
└── (a P0-local static list)     # ADD: the gallery + wizard-step stub stages (carve/mechanism/touch +
                                 #   TrackStep/ProjectNameStep/ScaffoldForm/TrackOneIdentityPanel/BaseResolution)
content/flows/
└── phase_b_characters.modular.yaml   # REUSE (read): the live Phase B manifest the map now reflects
```

**Structure Decision**: Single-package SPA change confined to `packages/studio/src/flowmap/` (plus read-only reuse of `survey/loadModularFlow.ts` and `survey/questions/registry.b.ts`). No new package, no cross-package boundary crossed; the `flowmap → survey` import edge already exists (`buildFlowGraph.ts` imports from `../survey/`). The "not-yet-ordered" stub stages are a small P0-local static list — the true manifest-driven unification of these stages is P4 and explicitly out of scope here.

## Complexity Tracking

> No Constitution Check violations — section intentionally empty.

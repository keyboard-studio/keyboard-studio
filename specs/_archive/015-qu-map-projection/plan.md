# Implementation Plan: Map projection — StepGraph → FlowGraph/GraphNode adapter in DashboardView

**Spec**: [spec.md](./spec.md) · **Phase**: 1 (Question Unification) · **Spec #**: 1 of 8 · **Branch**: `speckit/question-unification-phase1-specs`

**Source**: [docs/design-notes/question-unification-migration-plan.md](../../docs/design-notes/question-unification-migration-plan.md) §2.2(a), §2.4 step 1, §2.5; findings [question-unification-findings.md](../../docs/design-notes/question-unification-findings.md) (a).

## Summary

Wire `DashboardView`/`FlowMapView` to project the manifest spine onto the rendered Flow Map by adding a **`StepGraph` → `FlowGraph`/`GraphNode` adapter** over the already-written-but-never-wired `buildManifestStepGraph()`. The adapter stamps each projected editor-step with `kind:'stub'` (lighting the dead legend swatch) and hangs the four per-phase `buildModularFlowGraph()` graphs as registry-keyed drill-downs under their question-step nodes. Everything is read-only, dev-flag-gated, store/editor-free, and byte-identical when off. This is the load-bearing foundation that gates specs 016–022.

## Why this is an adapter, not a switch (the core design constraint)

| Layer | Symbol | Type it consumes/produces |
|---|---|---|
| Projection (exists, unwired) | `buildManifestStepGraph()` (`dashboard/buildStepGraph.ts:237`) | returns **`StepGraph`** of `StepGraphNode` (`type:'editor-step'\|'question-step'`, `spine`, `lock`, `joinTarget`, `writePaths`, `inputPaths`) |
| Layout (only one) | `layoutFlowGraph` (`dashboard/layout.ts:60`) | consumes **`FlowGraph`** only |
| Renderer (only one) | `FlowGraphView` (`dashboard/FlowGraphView.tsx:60`, props `{ graph: FlowGraph }`) | consumes **`FlowGraph`** only |

`StepGraph` and `FlowGraph` are **different types** (`dashboard/model.ts`): `FlowGraph.nodes` are `GraphNode` (carry `kind:NodeKind` + `region:NodeRegion`), `StepGraph.nodes` are `StepGraphNode` (carry `type:StepNodeType`, no `kind`). So projecting the manifest requires a real type adaptation — mapping each `StepGraphNode` to a `GraphNode` and each `StepGraphEdge` to a `GraphEdge` — not a one-line source swap in `FLOW_SOURCES`.

## Components / files to touch

- **NEW** `packages/studio/src/dashboard/manifestProjection.ts` (working name) — the adapter. Exports `buildManifestProjection(): FlowGraph` (DEC-001 = Variant A, resolved). Imports `buildManifestStepGraph` from `./buildStepGraph.ts`, types from `./model.ts`, `questionRegistry` from `../survey/questions/registry.ts`. **Imports neither `stores/` nor `editors/`.**
- **EDIT** `packages/studio/src/dashboard/DashboardView.tsx` — render the manifest projection in the Survey-flow section (the `section === "flow"` block, `DashboardView.tsx:354-392`), hanging the existing four `FLOW_SOURCES` modular graphs as registry-keyed drill-downs under their question-step nodes. The four `safeBuild(FLOW_SOURCES)` graphs are retained as the drill-down source; the new top-level ordering is the manifest projection.
- **NEW** test `packages/studio/src/dashboard/manifestProjection.test.ts` (or co-located in `buildStepGraph.test.ts`) — the §2.5 map-projection test (FR-010).
- **NO EDIT** to `buildManifestStepGraph`, `computeReserveNodes`, `FlowGraphView`/`layout.ts` model types, `StudioShell.tsx` gating (`SHOW_FLOWMAP` already gates the mount), any `stores/`, `editors/`, `steps/manifest.ts`, or `packages/contracts`.

## Adapter / wiring design

1. **Node mapping (`StepGraphNode` → `GraphNode`):**
   - `id` ← `step.id`; `label` ← `step.label`; `isEntry`/`isTerminal` ← carry through.
   - `kind: "stub"` for every projected manifest editor-step (FR-002); `region: "not-yet-ordered"` (matches the existing taxonomy in `model.ts:46` and the existing stub palette `FlowGraphView.tsx:47-49`).
   - `type` (the `GraphNode.type: FlowQuestionType`) — pick a benign default during planning (the manifest `StepNodeType` is `editor-step|question-step`, not a `FlowQuestionType`); the field is informational for stub nodes. `required`/`engineResolved`/`advisory` default false; `isGate` false; `optionCount` 0.
   - `flowId` — a stable synthetic id for the manifest spine section (e.g. `"manifest"`).
2. **Edge mapping (`StepGraphEdge` → `GraphEdge`):** spine → `linear`; fork → a branch edge; join → a branch edge back to `joinTarget`. Preserve the manifest ordering (FR-003). `dangling:false` (manifest ids are all known).
3. **Drill-down attachment (FR-004):** keep the four `buildModularFlowGraph()` graphs; attach each as a drill-down keyed by a `questionRegistry` id under the question-step node it belongs to (e.g. under the `characters` placeholder). Per DEC-001 = Variant A, this is a render-time association in `DashboardView`. The key is a registry id so a registry/manifest divergence is observable (the seam spec 016's drift guardrail will assert against).
4. **Flag gate (FR-005, DEC-002):** no change needed beyond confirming `SHOW_FLOWMAP` (`StudioShell.tsx:84`) already gates whether `FlowMapView` mounts. Confirm no finer sub-toggle is added.

### DEC-001 — adapter shape → **RESOLVED: Variant A** (Matthew Lee, 2026-06-29)

- **Variant A — standalone adapter → `FlowGraph`, reuse `FlowGraphView`/`layoutFlowGraph`.** Lowest new surface; reuses the existing renderer and its stub palette unchanged. Risk: the manifest spine's fork/join semantics must be expressible as `GraphEdge` kinds.
- **Variant B — `StepGraph`-aware layout+view variant.** A parallel render path that consumes `StepGraph` directly. More faithful to spine/lock semantics; larger new surface and a second renderer to keep green.

**Decision: Variant A** — a standalone `StepGraph` → `FlowGraph`/`GraphNode` adapter consumed by the existing `FlowGraphView`/`layoutFlowGraph`, **no rendering fork**. *Rationale*: lowest new surface and reuses the existing renderer/stub palette unchanged; the manifest fork/join semantics map cleanly onto the existing `GraphEdge` kinds (spine→linear, fork→branch, join→branch-back), so Variant B's parallel render path is unnecessary. The "Components / files to touch" and "Adapter / wiring design" sections above already describe the Variant A implementation.

### DEC-002 — dev-flag reuse → **RESOLVED: reuse `SHOW_FLOWMAP`** (Matthew Lee, 2026-06-29)

**Decision: reuse the existing `SHOW_FLOWMAP` flag; no new flag is introduced in Phase 1.** The projection inherits the gate because it lives inside `FlowMapView`, which only mounts when `SHOW_FLOWMAP` is true (`StudioShell.tsx:84,131`). No finer sub-toggle is added.

## Intra-spec sequencing (within spec 015)

1. Land the adapter module + unit-level node/edge mapping (no `DashboardView` edit yet) — pure, testable.
2. Add the §2.5 map-projection test against the adapter (FR-010) — red→green on the adapter alone.
3. Wire `DashboardView` to consume the adapter and attach drill-downs (FR-004/FR-005).
4. Run the full boundary/typecheck/test gate (FR-006/SC-004/SC-005).

> Note on cross-spec sequencing: spec 017 ("declare inputs/writes") will sequence **writes-before-inputs** to keep completeness C5 from transiently reddening. **That ordering is spec 017's concern, not this spec's** — 015 declares nothing on any step; it only projects existing manifest data. Recorded here so the dependency is visible, not to action it.

## How the Phase-1 invariants are preserved

- **No new write routing / no `mutate()`:** the adapter and `DashboardView` edit touch only read-only dashboard code; no store mutator, reducer, or `mutate()` path is added. (FR-007.)
- **No contracts bump:** reuses `dashboard/model.ts` `FlowGraph`/`GraphNode` and existing `KeyboardIR` locations; `packages/contracts` untouched. (FR-007.)
- **Behavior byte-identical:** with `SHOW_FLOWMAP` off, `FlowMapView` does not mount, so the adapter never runs and the SPA render path is unchanged; with it on, only the developer Flow Map tab changes, and no IR/runtime write occurs. (FR-008/SC-006.)
- **Step appears as a map node:** the adapter projects one `GraphNode` per manifest entry, lighting the `kind:'stub'` legend — the headline acceptance (US1/US2, SC-001/SC-002).
- **Read-only / store-free boundary:** the adapter imports neither `stores/` nor `editors/`; `pnpm depcruise` stays green at 593 modules (FR-006/SC-004).
- **`computeReserveNodes` untouched:** the projection never routes reserve/library content; that stays the modular-path / spec-022 concern (FR-009/SC-007).

## Risks & mitigations

- **Fork/join edge fidelity (Variant A):** if `GraphEdge` kinds cannot express spine/fork/join cleanly, fall back to Variant B. Mitigation: prototype the edge mapping in step 1 before wiring.
- **Drill-down attachment dropping a currently-shown node:** assert in the map-projection test that the union of rendered nodes is a superset of today's four-section node set (SC-003).
- **Accidental boundary breach:** the adapter must not transitively pull `stores/` via a convenience import; depcruise at 593 is the gate (run it in CI for this spec).

## Test strategy (per migration-plan §2.5)

- **Map-projection test (FR-010):** dashboard spine node set == `buildManifestStepGraph()` → adapter node set; drill-downs keyed off `questionRegistry`. Exercises the new adapter, distinct from the tautology at `buildStepGraph.test.ts:323-356`.
- **`kind:'stub'` assertion:** every projected editor-step node has `kind==="stub"` / `region==="not-yet-ordered"`.
- **Drill-down superset assertion:** no node the current four-section view shows is dropped.
- **Boundary:** `pnpm depcruise` green at 593 modules, no `dashboard → stores/editors` edge.
- **Regression:** `pnpm typecheck`; studio + contracts vitest; flag-off render byte-identical (no new flag-on IR/runtime path introduced).

## Build / test commands

- Typecheck: `pnpm typecheck`
- Tests: `pnpm test` (studio + contracts vitest)
- Boundaries: `pnpm depcruise` (must stay green at 593 modules; forbids `dashboard → stores`)
- Full gate: `pnpm typecheck` + studio/contracts vitest + `pnpm depcruise` + flag-off render unchanged

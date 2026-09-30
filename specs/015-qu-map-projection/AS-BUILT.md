# Spec 015 Map projection (Question Unification Phase 1a): as built

**Status:** Retired 2026-09-29. Shipped in PR #864 (squash `f5f3c947`, 2026-06-29; spec authored in #837 `f45d0db4`). Tasks: 20/20 complete.
**Full docs:** [specs/_archive/015-qu-map-projection/](../_archive/015-qu-map-projection/) (spec, plan, tasks). Not read by default.
**Pinned here:** none

## What shipped
- A `StepGraph` to `FlowGraph` adapter projects the manifest spine onto the Flow Map so editor-steps (identity, choose_base, track, project_name, characters, carve, mechanisms, touch_seed_source, touch, help, package) render as first-class nodes.
- Every projected node is `kind: "stub"`, `region: "not-yet-ordered"`, which lit the previously dead "stub (gallery / wizard step)" legend swatch.
- The per-phase modular graphs hang as registry-keyed drill-downs under the manifest question-step node.
- Read-only: no contracts bump, no `mutate()`, no IR or runtime change; store-free dashboard preserved.

## Public contracts (packages/studio/src/dashboard/manifestProjection.ts)
- `buildManifestProjection(): FlowGraph` -- one `GraphNode` per manifest step; spine/fork/join edges map to `linear`/`default` `GraphEdge`s; data edges (writes to inputs) are NOT projected.
- `MANIFEST_FLOW_ID = "manifest"`, `MANIFEST_FLOW_TITLE`, `MANIFEST_NODE_TYPE = "notice"` (benign type for stub nodes).
- `ManifestDrillDown`, `ManifestProjection`, `CHARACTERS_STEP_ID = "characters"`, `registryKeyForFlow(graph)`, `attachDrillDowns(flows)`, `buildManifestProjectionWithDrillDowns`.
- Consumed by `dashboard/DashboardView.tsx` (`buildManifestProjection()` at ~485, `attachDrillDowns` at ~488).
- Test: `dashboard/manifestProjection.test.ts` (map-projection test, FR-010: spine node set equals `buildManifestStepGraph()` node set; drill-down attachment keyed by registry id).

## Key decisions
- DEC-001 Variant A: standalone adapter feeding the existing `FlowGraphView`/`layoutFlowGraph`; no renderer fork or parallel palette.
- DEC-002: reuse the existing dev flowmap gate (no new flag).
- Drill-down key is a `questionRegistry` id so a registry/manifest divergence is observable (the seam spec 016 asserts against).
- `computeReserveNodes` untouched; library/reserve stays on the modular-graph diff path.

## Gotchas and limits
- Drill-down attachment originally hung all four FLOW_SOURCES under `characters`; spec 024 later derived drill-downs from step `flowRefs`.
- Dashboard must not import `stores/` or `editors/` (depcruise `dashboard-layer`).
- Projected stubs are metadata-only; `inputs`/`writes` on them came from spec 017.

## Divergences from the spec
- Spec cites `SHOW_FLOWMAP` at `StudioShell.tsx:84`; code has it at `packages/studio/src/lib/navItems.ts:16` (`import.meta.env.DEV || VITE_SHOW_FLOWMAP === "1"`), imported in `StudioShell.tsx:65`. Same semantics.
- Spec calls the viewer `FlowMapView`; code is `DashboardView` (`dashboard/`).
- Spec's "593-module" depcruise baseline is stale; not re-checked.

## Follow-ups and open issues
- Stale `specs/015-qu-map-projection/...` links: only `specs/016-qu-drift-guardrail/spec.md` and `specs/017-qu-declare-steps/spec.md` (both being retired; they link the stub folder).
- `docs/spec-trace.json` entry `specs/015-qu-map-projection` orphaned.

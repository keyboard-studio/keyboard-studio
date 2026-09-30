# Spec 010 Dashboard-honest flow map (P0): as built

**Status:** Retired 2026-09-29. Shipped in PR #704 (squash `802d0c35`, 2026-06-26); gates closed out in PR #1186 (`5e2645e5`). Tasks: 21/21 complete.
**Full docs:** [specs/_archive/010-dashboard-honest-flow-map/](../_archive/010-dashboard-honest-flow-map/) (spec, plan, tasks, research, data-model, contracts, checklists). Not read by default.
**Pinned here:** none

## What shipped
- The read-only Flow Map stopped reading legacy `content/flows/*.yaml` for Phase B and now reads the live modular registry, so the map's node set equals the runtime step set ("map == runtime by construction").
- Registered modules no live manifest references render as `kind: "library-not-in-flow"` reserve nodes (visually distinct, marked not running).
- Galleries (carve / mechanism / touch) and hand-built wizard steps (track, project-name, scaffold, identity panel, base resolution) render as `kind: "stub"` nodes with title/kind only, no fabricated inputs/writes.
- A failed modular load shows a per-section error banner, never a silent fallback to legacy YAML.
- A regression net: derived-equality (FR-010 Part A), reserve = registry minus live (Part B), edge/label snapshot (Part C).

## Public contracts
- Types live in `packages/studio/src/dashboard/model.ts`: `NodeKind = "live" | "library-not-in-flow" | "stub" | "proposed"`; `NodeRegion = "flow" | "not-yet-ordered" | "library" | "leftover"`; `EdgeKind = "linear" | "conditional" | "default"`; `GraphNode` carries `kind` and `region`.
- Builders in `packages/studio/src/dashboard/buildStepGraph.ts`: `buildModularFlowGraph(raw, title, registry)` (throws on bad manifest; caller surfaces the error), `buildLibraryReserveNodes`, `buildLeftoverNodes`, `buildManifestStepGraph()`.
- Verification tests: `packages/studio/src/dashboard/buildStepGraph.test.ts` ("Phase B honesty (FR-010)", Parts A/B/C, snapshot under `__snapshots__/`).
- Routing to an id outside the live set is a dangling edge, never dropped.

## Key decisions
- Reserve modules shown, not hidden -- honesty preserved by explicit marking (clarification 2026-06-26).
- Stubs and reserve grouped in a "not-yet-ordered" region rather than implying a spine order P0 could not guarantee.
- Equality asserted by derivation from the registry plus a snapshot, not by a hand-kept list.
- Read-only: the authoring editor stays in the separate `specs/009-flow-map-editor`.

## Gotchas and limits
- The spec's file names are stale. `flowmap/FlowMapView.tsx` and `buildFlowGraph.ts` no longer exist; the viewer is `dashboard/DashboardView.tsx` with `dashboard/buildStepGraph.ts`.
- Later specs extended the taxonomy: `region: "library"` and `"leftover"`, `kind: "proposed"` (spec 025), and manifest-projected stubs (`dashboard/manifestProjection.ts`, spec 015). "Stub" now also means a projected manifest step.
- Since spec 012, node-set honesty for the spine comes from `buildManifestStepGraph` reading `steps/manifest.ts`; the modular-flow path drives drill-downs.
- Proposed-flow nodes are excluded from the rendered-vs-runtime bijection (`dashboard/renderedNodeSet.ts`, `driftGuardrail.test.ts`).
- Phase A / F / identity-lite legacy-loader split described in the spec was later retired (spec 013).

## Divergences from the spec
- Spec says P0 nodes live in `flowmap/`; code moved to `dashboard/` (spec 012 P4b). Not a bug.
- Spec says stubs are title/kind-only in `not-yet-ordered`; manifest-projected stubs now carry step kind and IR paths (`model.ts` step-kind fields). Intentional extension.
- Part A now guards live nodes against `loadModularFlow` per shipped flow (`buildStepGraph.test.ts:79-155`), broader than the single Phase B check.

## Follow-ups and open issues
- Stale citations: `specs/012-step-model-manifest/spec.md` links `../010-.../` paths; still resolve to the stub.
- `docs/spec-trace.json` entry `specs/010-dashboard-honest-flow-map` orphaned after the move.

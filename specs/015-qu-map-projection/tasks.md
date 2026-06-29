# Tasks: Map projection — StepGraph → FlowGraph/GraphNode adapter in DashboardView

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Phase**: 1, spec #1 · **Branch**: `speckit/question-unification-phase1-specs`

Phase-1 invariants in force for every task: **no new write routing**, **no contracts bump**, **behavior byte-identical when flag off**, **each manifest step appears as a map node**, **read-only / store/editor-free**.

## A. Decisions (resolve before implementation)

- [x] **T001** Resolve **DEC-001 (adapter shape)**: **RESOLVED = Variant A** (Matthew Lee, 2026-06-29) — a standalone `StepGraph` → `FlowGraph`/`GraphNode` adapter reusing the existing `FlowGraphView`/`layoutFlowGraph`, **no rendering fork**. Recorded in plan.md (§"DEC-001") and spec.md (Clarifications, FR-001). Variant B (`StepGraph`-aware layout+view) is not pursued.
- [x] **T002** Resolve **DEC-002 (dev-flag reuse)**: **RESOLVED = reuse `SHOW_FLOWMAP`** (`StudioShell.tsx:84`) (Matthew Lee, 2026-06-29) — it is the gate and **no new flag** is introduced in Phase 1. Recorded in plan.md (§"DEC-002") and spec.md (Clarifications, FR-005).

## B. Grounding (read-only verification of current state)

- [ ] **T003** Confirm `buildManifestStepGraph()` (`dashboard/buildStepGraph.ts:237`) is unwired today — `DashboardView` builds only from `FLOW_SOURCES` via `buildModularFlowGraph()` (`DashboardView.tsx:48-54`). Note the manifest step ids: `identity`, `choose_base`, `track`, `project_name`, `characters`, `carve`, `mechanisms`, `touch_seed_source`, `touch`, `help`, `package`.
- [ ] **T004** Confirm `kind:'stub'` is emitted by nothing today (`grep` for `kind: "stub"` finds only the type/palette/legend definitions in `model.ts`, `FlowGraphView.tsx:47-49`, `DashboardView.tsx:114`) — the swatch is dead.
- [ ] **T005** Record the current `pnpm depcruise` module count baseline (expected **593**) and confirm green before any change.

## C. Adapter (the new artifact)

- [ ] **T006** Create `packages/studio/src/dashboard/manifestProjection.ts`. Import `buildManifestStepGraph` from `./buildStepGraph.ts`, `FlowGraph`/`GraphNode`/`GraphEdge`/`StepGraph`/`StepGraphNode`/`StepGraphEdge` from `./model.ts`, and `questionRegistry` from `../survey/questions/registry.ts`. **Do NOT import `stores/` or `editors/`.**
- [ ] **T007** Implement node mapping `StepGraphNode → GraphNode` (FR-001/FR-002): `kind:'stub'`, `region:'not-yet-ordered'`, carry `id`/`label`/`isEntry`/`isTerminal`; benign defaults for `type`/`required`/`engineResolved`/`advisory`/`isGate`/`optionCount`; a stable synthetic `flowId` for the manifest spine.
- [ ] **T008** Implement edge mapping `StepGraphEdge → GraphEdge` (FR-003): spine→linear, fork→branch, join→branch-back-to-`joinTarget`; `dangling:false`; preserve manifest order.
- [ ] **T009** Implement registry-keyed drill-down attachment (FR-004): associate each of the four `buildModularFlowGraph()` graphs with its question-step node, keyed by a `questionRegistry` id. Keep all four modular graphs renderable (drop no node).

## D. Map-projection test (§2.5, FR-010) — write against the adapter before wiring

- [ ] **T010** Add `packages/studio/src/dashboard/manifestProjection.test.ts`. Assert the **adapter node set equals the `buildManifestStepGraph()` node set** (one projected node per manifest step). Distinct from the tautology at `buildStepGraph.test.ts:323-356` — this exercises the new adapter.
- [ ] **T011** Assert every projected editor-step node has `kind === "stub"` and `region === "not-yet-ordered"` (US2/SC-001).
- [ ] **T012** Assert drill-downs are keyed off `questionRegistry` ids and that the rendered node union is a **superset** of today's four-section node set (no node dropped) (FR-004/SC-003).

## E. Wire DashboardView

- [ ] **T013** Edit `DashboardView.tsx` `section === "flow"` block (`DashboardView.tsx:354-392`) to render the manifest projection from the adapter as the spine, hanging the existing `FLOW_SOURCES` modular graphs as the registry-keyed drill-downs (FR-005). Keep `DashboardView` props-only / store-free (`DashboardView.tsx:11-14`).
- [ ] **T014** Confirm the wiring is reached only when `FlowMapView` mounts (i.e. under `SHOW_FLOWMAP`); add no new flag (DEC-002 / FR-005).

## F. Verification gate (run last)

- [ ] **T015** `pnpm typecheck` — green, no type errors from the new adapter or the `DashboardView` edit (SC-005).
- [ ] **T016** Studio + contracts vitest — green, including the new map-projection test; the pre-existing `buildStepGraph.test.ts:323-356` tautology test still passes (SC-002/SC-005).
- [ ] **T017** `pnpm depcruise` — green at the **593-module baseline**; assert **no new `dashboard → stores` or `dashboard → editors` edge** (FR-006/SC-004).
- [ ] **T018** Flag-off byte-identical check — with `SHOW_FLOWMAP` off, `FlowMapView` does not mount and the SPA render path is unchanged; confirm no IR/runtime behavior change in any flag state (FR-007/FR-008/SC-006).
- [ ] **T019** Confirm `computeReserveNodes` (`buildStepGraph.ts:150-182`) is unchanged and the projection routes no library/reserve content (FR-009/SC-007).
- [ ] **T020** Manual dev-build smoke (flag on): open the Flow Map → Survey flow tab; confirm one node per manifest editor-step renders and the "stub (gallery / wizard step)" legend swatch now describes rendered nodes (SC-001).

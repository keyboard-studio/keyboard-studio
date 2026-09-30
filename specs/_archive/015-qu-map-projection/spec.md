# Feature Specification: Map projection — render the manifest spine in DashboardView via a StepGraph → FlowGraph/GraphNode adapter

**Feature Branch**: `speckit/question-unification-phase1-specs`

**Created**: 2026-06-29

**Status**: **Ready for planning** — Phase 1, spec #1 of the Question Unification migration. This is the **read-only, dev-flag-gated FOUNDATION** that every other Phase-1 spec (016–022) sits behind. No contracts bump, no new write routing, no IR/runtime behavior change.

**Input**: Foundation piece (a) of [docs/design-notes/question-unification-migration-plan.md](../../docs/design-notes/question-unification-migration-plan.md) (§2.2(a); §2.4 step 1 "Map-projection first"; §2.5 map-projection test; §5 spec #1). Wire `DashboardView` to project the manifest spine onto the rendered flow map via a **new `StepGraph` → `FlowGraph`/`GraphNode` adapter** over `buildManifestStepGraph()`. The renderer (`dashboard/FlowGraphView.tsx:60`) and the layout (`dashboard/layout.ts:60`) consume `FlowGraph`/`GraphNode` **only**, while `buildManifestStepGraph()` (`dashboard/buildStepGraph.ts:237`) returns a different `StepGraph` type — so this is an **adapter, not a one-line renderer switch**. The adapter maps each manifest editor-step to a `GraphNode` with `kind:'stub'` so the existing "stub (gallery / wizard step)" legend renders for the first time, and hangs the per-phase `buildModularFlowGraph()` graphs as **registry-keyed drill-downs** under each question-step node.

**Governing scope**: This feature implements **Phase 1 foundation piece (a)** of the Question Unification migration ([docs/design-notes/question-unification-migration-plan.md](../../docs/design-notes/question-unification-migration-plan.md) §2.2(a)), the load-bearing first step of §2.4 intra-phase sequencing. It does **not** re-derive that scope. The companion research is recorded in [docs/design-notes/question-unification-findings.md](../../docs/design-notes/question-unification-findings.md) (findings (a) "buildManifestStepGraph written but never wired"; "computeReserveNodes vestigial / separate mechanism").

> **Note on technical content in this spec (deliberate).** Per repository convention — where `packages/studio/src/dashboard/` graph model types are architectural contracts and the extracted `specs/NNN/` folders carry real material — the non-obvious constraints (the `StepGraph` → `GraphNode` adapter shape, the `kind:'stub'` assignment, the registry-keyed drill-down attachment, the depcruise boundary, the dev-flag gate, the byte-identical-when-off guarantee) are specified here as Functional Requirements and Success Criteria. The *mechanics* (exact adapter signature vs. a `StepGraph`-aware layout+view variant, the precise drill-down nesting in `FlowGraphView`) remain plan-level.

## Phase-1 invariants (thread through every requirement)

- **No new write routing.** Phase 1 preserves every existing write path. Galleries keep their current mechanisms (carve direct store mutators; physical R1 `lockDesktop`; touch R2 `buildTouchLayoutJson`/side-car). `mutate()` is NOT introduced as a live write path for any new surface. This spec touches **only** the dashboard's read-only projection.
- **No contracts bump.** This spec reuses the existing `dashboard/model.ts` `FlowGraph`/`GraphNode`/`StepGraph` shapes and existing `KeyboardIR` locations. No new `KeyboardIR` field, no `@keyboard-studio/contracts` change, no §18 sign-off.
- **Behavior byte-identical.** With the dev flowmap flag **off**, the dashboard renders byte-identically to today. There is no IR or runtime behavior change in any flag state — this is a developer-only map projection.
- **Step appears as a map node.** Each manifest editor-step (carve, mechanisms, touch, track, project_name, choose_base, identity, characters, touch_seed_source, help, package) appears as a first-class node on the rendered flow map.
- **Read-only / declare-only.** The projection reads the manifest + `questionRegistry`; it declares nothing new on any step (declaring `inputs`/`writes` is spec 017) and resolves no component as its node (specs 018–021).

## Clarifications

### Session 2026-06-29

Phase 1 scope was confirmed by Matt (2026-06-29, migration-plan §6): Phase 1 only specs converting the custom/bespoke flow stages into opaque "questions" with valid inputs and outputs. Two items were open for this spec; both are now **RESOLVED** (Matthew Lee, 2026-06-29):

- **DEC-001 — Adapter shape** → **RESOLVED: Variant A.** Add a standalone `StepGraph` → `FlowGraph`/`GraphNode` adapter function consumed by the existing `FlowGraphView`/`layoutFlowGraph` — no rendering fork. *Rationale*: lowest new surface, reuses the existing renderer and stub palette unchanged; the manifest fork/join semantics map cleanly onto existing `GraphEdge` kinds, so the parallel `StepGraph`-aware render path (Variant B) is unnecessary.
- **DEC-002 — Dev-flag reuse** → **RESOLVED: reuse the existing `SHOW_FLOWMAP` flag** (`StudioShell.tsx:84`, `import.meta.env.DEV || import.meta.env.VITE_SHOW_FLOWMAP === "1"`), which already gates whether `FlowMapView` mounts. **No new flag is introduced in Phase 1.** *Rationale*: the projection lives inside `FlowMapView` and inherits that gate; no finer sub-toggle is warranted.

No other `[NEEDS CLARIFICATION]` markers remain.

## User Scenarios & Testing *(mandatory)*

> The "users" here are studio engineers reading the developer Flow Map and the dashboard maintainer responsible for keeping that map honest. Each story is independently testable and independently valuable.

### User Story 1 - Manifest editor-steps appear as first-class map nodes (Priority: P1)

A studio engineer opens the developer Flow Map and sees the carve / mechanism / touch (and the rest of the manifest spine — track, project_name, choose_base, identity, characters, touch_seed_source, help, package) editor-steps as **first-class nodes**, instead of the map showing only the four `*.modular.yaml` question batteries and hiding the mature live editor flows.

**Why this priority**: This is the headline deliverable. Today the dashboard's survey-flow section is built **only** from `FLOW_SOURCES` (`dashboard/DashboardView.tsx:48-54`) via `buildModularFlowGraph()`; it **never calls** `buildManifestStepGraph()` (`dashboard/buildStepGraph.ts:237`). The manifest editor-steps therefore get **no map node** and the map "hides the mature live flows" (findings (a)). Lighting up the manifest spine is the foundation every subsequent Phase-1 spec sits behind.

**Independent Test**: With the dev flowmap flag on, render the dashboard's Survey-flow section; confirm there is exactly one map node per manifest entry — `identity`, `choose_base`, `track`, `project_name`, `characters`, `carve`, `mechanisms`, `touch_seed_source`, `touch`, `help`, `package` — sourced from `buildManifestStepGraph()` via the adapter (not from the four YAMLs).

**Acceptance Scenarios**:

1. **Given** the dev flowmap flag is on, **When** the dashboard renders the Survey-flow section, **Then** the map renders one node per manifest editor-step (carve, mechanisms, touch, track, project_name, choose_base, etc.), each projected from `buildManifestStepGraph()` through the adapter.
2. **Given** the projected spine nodes, **When** they render, **Then** their order and fork/join edges mirror the manifest spine (spine edges between consecutive `spine:true` steps; fork to `spine:false` steps; join back to `joinTarget`).
3. **Given** the dev flowmap flag is off, **When** StudioShell mounts, **Then** `FlowMapView` does not mount (per `SHOW_FLOWMAP`) and the application renders byte-identically to today.

---

### User Story 2 - The `kind:'stub'` legend renders for the first time (Priority: P1)

The "stub (gallery / wizard step)" legend swatch — present in `FlowLegend` (`DashboardView.tsx:114`) and styled in `FlowGraphView` (`FlowGraphView.tsx:47-49`) but **dead** because nothing emits `kind:'stub'` today — goes live: each projected manifest editor-step node carries `kind:'stub'`, so the swatch maps to real nodes for the first time.

**Why this priority**: The migration plan calls out (§2.2(a), findings (a)) that the stub legend is dead — "nothing emits `kind:'stub'` today, so the legend does not go live automatically; the adapter is what lights it." Lighting the legend is the visible proof that the adapter, not a renderer accident, is producing the nodes. It is P1 because it is the same deliverable as US1 viewed from the legend side and is the cheapest end-to-end assertion that the projection is wired.

**Independent Test**: Render the projected graph; assert every projected manifest editor-step node has `kind === "stub"` and that `FlowGraphView`'s stub palette (border `#58a6ff`, badge "stub") is applied; assert the "stub (gallery / wizard step)" legend item now corresponds to at least one rendered node.

**Acceptance Scenarios**:

1. **Given** the adapter projects a manifest editor-step, **When** it produces the `GraphNode`, **Then** `node.kind === "stub"` and `node.region === "not-yet-ordered"` (consistent with the existing taxonomy in `model.ts:39,46`).
2. **Given** the rendered map, **When** a projected stub node is laid out, **Then** it uses the existing stub styling (`FlowGraphView.tsx:47-49`) — no new palette is introduced.
3. **Given** the legend, **When** the projection is active, **Then** the pre-existing "stub (gallery / wizard step)" swatch (`DashboardView.tsx:114`) is no longer dead — it describes rendered nodes.

---

### User Story 3 - One adapter projects the spine + registry-keyed drill-downs (Priority: P2)

The manifest spine (the projection) and the per-phase modular graphs (the four `buildModularFlowGraph()` graphs) are rendered from **one adapter**: the manifest editor-steps project to spine nodes, and each per-phase modular graph hangs as a **registry-keyed drill-down** under its question-step node — so the map and the runtime derive from the same structure and cannot drift by construction.

**Why this priority**: The load-bearing invariant (§1 of the plan) is that the map is a read-only projection of the *same* structure the app renders from (manifest + `questionRegistry`). Hanging the modular graphs as drill-downs keyed off `questionRegistry` is what makes "one structure" literally true on the rendered map. It is P2 because the spine projection (US1/US2) is the gating deliverable; the drill-down attachment is the structural correctness that the drift guardrail (spec 016) will later enforce.

**Independent Test**: Render the projection; assert the per-phase `buildModularFlowGraph()` graphs appear as drill-downs whose attachment is keyed off `questionRegistry` ids under the relevant question-step node (e.g. the `characters` placeholder), and that the dashboard still renders the four phase sections without losing any node it shows today.

**Acceptance Scenarios**:

1. **Given** the four `FLOW_SOURCES` modular graphs, **When** the adapter renders, **Then** each per-phase `buildModularFlowGraph()` graph hangs as a registry-keyed drill-down under its question-step node — not as a parallel top-level ordering list divorced from the manifest.
2. **Given** the drill-down attachment, **When** it is keyed, **Then** the key is a `questionRegistry` id (`survey/questions/registry.ts`), so a registry/manifest divergence is observable (and is what spec 016's drift guardrail will assert against).
3. **Given** the projection is active, **When** the dashboard renders, **Then** no node the current four-section view shows is lost — the modular graphs continue to render, now reframed as drill-downs.

---

### User Story 4 - Read-only, store/editor-free, depcruise stays green (Priority: P2)

The dashboard maintainer can ship this foundation with **zero** runtime/IR impact, the dashboard staying store-free / props-only, the adapter avoiding `stores/` and `editors/`, and `pnpm depcruise` staying green at the 593-module baseline.

**Why this priority**: The foundation is only safe to ship first if it cannot regress the working copy or breach the dashboard layer boundary. The depcruise rule forbids `dashboard → stores/editors`; an adapter that reached into either would break the boundary the whole Phase-1 plan relies on. It is P2 because it is a non-functional guard on US1–US3 rather than a user-visible behavior.

**Independent Test**: Run `pnpm depcruise`; confirm green at 593 modules with no new `dashboard → stores` or `dashboard → editors` edge. Run `pnpm typecheck` and the studio + contracts vitest suites; confirm green with no IR or runtime behavior change.

**Acceptance Scenarios**:

1. **Given** the new adapter, **When** boundaries are checked, **Then** it imports neither `stores/` nor `editors/` (it may import `steps/manifest.ts` and `dashboard/` modules, consistent with the existing `buildManifestStepGraph` boundary note at `buildStepGraph.ts:218-222`).
2. **Given** the dashboard, **When** it consumes the adapter, **Then** it remains props-only / store-free (`DashboardView.tsx:11-14` constraint preserved).
3. **Given** the full gate, **When** `pnpm depcruise` + `pnpm typecheck` + studio/contracts vitest run, **Then** all are green; depcruise stays at the **593-module** baseline.

---

### Edge Cases

- **Flag off entirely**: `FlowMapView` never mounts (per `SHOW_FLOWMAP`), so the adapter never runs; output is byte-identical to today. The projection cannot affect a non-dev build.
- **A manifest step that is `spine:false`** (`project_name`, `touch_seed_source`): projected as a node with a fork edge from its preceding spine step and a join edge back to its `joinTarget`, matching `buildManifestStepGraph`'s existing edge rules — it still gets a map node.
- **`computeReserveNodes` is NOT this mechanism**: `computeReserveNodes` (`buildStepGraph.ts:150-182`) runs on the `buildModularFlowGraph` registry-vs-YAML diff path and is vestigial today; its content comes from the §2.3 library demotions in spec 022, **not** from this manifest projection. This spec must not change `computeReserveNodes` or route library content through the projection.
- **A modular graph fails to parse** (`safeBuild` error path, `DashboardView.tsx:56-64`): the existing fail-visibly behavior is preserved; the projection does not introduce a fallback to legacy YAML.
- **A `package` step marked reserved/terminal**: still projected as a node (it is in the manifest); no special-casing beyond the existing `isTerminal` flag.
- **The pre-existing tautological test** at `buildStepGraph.test.ts:323-356` (manifest ↔ `buildManifestStepGraph` node ids) is **not** the map-projection test this spec adds; the new test asserts the *dashboard spine node set* equals the *adapter* node set (§2.5), which exercises the new adapter, not the raw `StepGraph`.

## Requirements *(mandatory)*

### Functional Requirements

**The adapter (the new projection surface)**

- **FR-001**: The system MUST add a **`StepGraph` → `FlowGraph`/`GraphNode` adapter** (per DEC-001 = Variant A: a standalone adapter consumed by the existing `FlowGraphView`/`layoutFlowGraph`, no rendering fork) that maps each `buildManifestStepGraph()` (`dashboard/buildStepGraph.ts:237`) node — both `type:'editor-step'` and `type:'question-step'` `StepGraphNode`s — to a renderable `GraphNode` (`dashboard/model.ts:49`). It MUST NOT be a one-line renderer switch: the renderer `FlowGraphView` (`FlowGraphView.tsx:60`) and the layout `layoutFlowGraph` (`layout.ts:60`) consume `FlowGraph`/`GraphNode` only, a different type from the `StepGraph` `buildManifestStepGraph` returns, so a real type adaptation is required.
- **FR-002**: The adapter MUST assign **`kind:'stub'`** to each projected editor-step node (and `region:'not-yet-ordered'`, consistent with `model.ts:46`), so the existing "stub (gallery / wizard step)" legend swatch (`DashboardView.tsx:114`) renders against real nodes for the first time. Nothing emits `kind:'stub'` today; the adapter is the sole emitter.
- **FR-003**: The adapter MUST preserve the manifest spine ordering and fork/join edge structure from `buildManifestStepGraph()` — spine edges between consecutive spine steps, fork edges to `spine:false` steps, join edges back to `joinTarget` — when projecting `StepGraphEdge`s onto the rendered graph's edges.
- **FR-004**: The adapter MUST hang the per-phase `buildModularFlowGraph()` graphs (the four `FLOW_SOURCES`, `DashboardView.tsx:48-54`) as **registry-keyed drill-downs** under their question-step nodes, with the drill-down key being a `questionRegistry` id (`survey/questions/registry.ts`). The modular graphs MUST continue to render (no node currently shown is dropped).

**Wiring**

- **FR-005**: `DashboardView` (`FlowMapView`, `DashboardView.tsx:311`) MUST consume the adapter to render the Survey-flow section, so the manifest spine is projected onto the rendered map. The wiring MUST be gated by the existing dev-only flowmap flag (`SHOW_FLOWMAP`, `StudioShell.tsx:84`) — per DEC-002 (resolved), **no new flag is introduced**.

**Boundary & read-only invariants**

- **FR-006**: The dashboard MUST remain **store-free / props-only** (`DashboardView.tsx:11-14`); the adapter MUST NOT import `stores/` or `editors/`. `pnpm depcruise` MUST stay green at the **593-module** baseline with no new `dashboard → stores` or `dashboard → editors` edge.
- **FR-007**: This feature MUST be **read-only and store/editor-free**: it introduces **no new write routing**, does **not** introduce `mutate()` for any surface, and produces **no IR or runtime behavior change** in any flag state. It is a developer-only map projection.
- **FR-008**: With the dev flowmap flag **off**, the application MUST render **byte-identically to today** (the flag already gates whether `FlowMapView` mounts; the projection MUST NOT alter the non-dev render path).
- **FR-009**: This feature MUST NOT change `computeReserveNodes` (`buildStepGraph.ts:150-182`) or route library/reserve content through the manifest projection — `computeReserveNodes` runs on the `buildModularFlowGraph` registry-vs-YAML diff path and gets its content from the §2.3 demotions in **spec 022**, not from this projection.

**Map-projection test (§2.5)**

- **FR-010**: A **map-projection test** (migration-plan §2.5) MUST assert that the **dashboard spine node set equals the `buildManifestStepGraph()` → adapter node set**, with the per-phase drill-downs keyed off `questionRegistry`. This test MUST exercise the **new adapter**, distinct from the pre-existing tautological manifest ↔ `buildManifestStepGraph` test at `buildStepGraph.test.ts:323-356`.

**Out of scope (explicit non-goals)**

- **FR-011**: This feature MUST NOT implement the drift-guardrail bijection test (spec 016), declare `inputs`/`writes` on any step (spec 017), wire any component to resolve as its node (specs 018–021), perform any library demotion or `computeReserveNodes` content change (spec 022), change the SPA render path (StudioShell still hand-places components), introduce write routing / `mutate()` / a contracts bump, or promote any drill-down to a first-class manifest entry (Phase 2).

### Key Entities *(include if feature involves data)*

- **`StepGraph` / `StepGraphNode`** (`dashboard/model.ts:116,165`): what `buildManifestStepGraph()` returns — `type:'editor-step'|'question-step'`, `spine`, `lock`, `joinTarget`, `writePaths`, `inputPaths`. The **source** the adapter reads. Unchanged by this spec.
- **`FlowGraph` / `GraphNode`** (`dashboard/model.ts:49,93`): what `FlowGraphView`/`layoutFlowGraph` render — carries `kind:NodeKind` (`"live"|"library-not-in-flow"|"stub"`) and `region:NodeRegion`. The **target** the adapter produces. Unchanged by this spec (reused as-is — no contracts/model change).
- **`buildManifestStepGraph()`** (`buildStepGraph.ts:237`): the projection function, written but never wired (findings (a)); this spec finally wires it via the adapter. Unchanged.
- **The new adapter**: maps `StepGraphNode` → `GraphNode` with `kind:'stub'`; attaches `buildModularFlowGraph()` drill-downs keyed by `questionRegistry`. The single new artifact.
- **`questionRegistry`** (`survey/questions/registry.ts`): the consolidated registry (composed of `registry.a.ts`/`registry.b.ts`/`registry.f.ts`); the drill-down key source.
- **`SHOW_FLOWMAP`** (`StudioShell.tsx:84`): the existing dev-only flowmap gate (`DEV || VITE_SHOW_FLOWMAP==="1"`); the projection's gate (DEC-002).
- **`computeReserveNodes`** (`buildStepGraph.ts:150-182`): the SEPARATE, vestigial reserve-node mechanism on the modular diff path; explicitly NOT touched here (FR-009).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With the dev flowmap flag on, the dashboard renders **one map node per manifest editor-step** (`identity`, `choose_base`, `track`, `project_name`, `characters`, `carve`, `mechanisms`, `touch_seed_source`, `touch`, `help`, `package`), including the `kind:'stub'` legend swatch now live against real nodes.
- **SC-002**: The **dashboard spine node set equals the `buildManifestStepGraph()` → adapter node set**, asserted by the map-projection test (FR-010), and that test exercises the new adapter (not the pre-existing tautology).
- **SC-003**: The per-phase modular graphs render as **registry-keyed drill-downs** under their question-step nodes, keyed by `questionRegistry` ids; no node the current four-section view shows is dropped.
- **SC-004**: `pnpm depcruise` stays **green at the 593-module baseline**; a repo audit finds **zero** new `dashboard → stores` or `dashboard → editors` edge introduced by the adapter or wiring.
- **SC-005**: `pnpm typecheck` and the studio + contracts vitest suites pass; **zero** IR or runtime behavior change is observable (read-only projection).
- **SC-006**: With the flag **off**, the application renders **byte-identically to today** and the adapter never runs.
- **SC-007**: `computeReserveNodes` is **unchanged** and the projection routes **no** library/reserve content (it remains the spec-022 / modular-path concern).

## Assumptions

- **`buildManifestStepGraph()` is correct and exercised only by tests today** (`buildStepGraph.ts:237`; findings (a)). This spec wires it without modifying it.
- **The dev flowmap gate is `SHOW_FLOWMAP`** (`StudioShell.tsx:84`), which already decides whether `FlowMapView` mounts. The projection reuses this gate (DEC-002); no new flag is introduced in Phase 1.
- **The `dashboard → steps/` import is allowed** by the depcruise dashboard-layer rule (per the boundary note at `buildStepGraph.ts:218-222`); `dashboard → stores/` and `dashboard → editors/` are forbidden and stay forbidden.
- **The 593-module depcruise baseline is current** (migration-plan §2.2(a)); the adapter adds at most the new adapter module(s) without breaching the boundary, and the baseline assertion is the gate.
- **The SPA render path is untouched** — `StudioShell` continues to hand-place the real components via its `activeStepId` switch; this spec only changes the developer Flow Map projection.
- **No contracts bump and no `mutate()`** — Phase 1 reuses existing `KeyboardIR` locations and existing dashboard model types; all contracts decisions are deferred to Phase 2 (migration-plan §6).
- **The pre-existing tautological test** (`buildStepGraph.test.ts:323-356`) stays green and is **not** repurposed as the map-projection test; the new test is additive and adapter-exercising.

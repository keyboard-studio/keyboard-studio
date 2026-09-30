# Implementation Plan: Drift guardrail — CI bijection between the rendered graph and manifest + questionRegistry runtime reach

**Spec**: [spec.md](./spec.md) · **Branch**: `speckit/question-unification-phase1-specs` · **Migration plan**: [question-unification-migration-plan.md](../../docs/design-notes/question-unification-migration-plan.md) §2.2(b), §2.4 step 2, §2.5, §4, §5 spec #2

## Summary

Add a single CI test — the **drift guardrail** — that asserts a bijection between the node set the dashboard ACTUALLY renders (post-015: the `StepGraph`→`FlowGraph`/`GraphNode` adapter output over `buildManifestStepGraph()` plus the `buildModularFlowGraph` drill-downs keyed by `questionRegistry`) and the union of manifest step ids + runtime-reachable `questionRegistry` ids. The set is computed **per-graph**: manifest editor-steps via `findUnreachable` (`completeness.ts:475-499`), survey questions via `resolveNext` over `next` / `FlowGotoRule[]` (the `buildGraphFromQuestions` edge set, `buildStepGraph.ts:84-112`); both run. A negative test injects (a) an uncovered manifest step and (b) an orphan registry id and asserts each turns the guardrail RED. This is **test-only**: no contracts bump, no new write routing, no flag flip, behavior byte-identical.

## Phase-1 invariants (threaded through every component)

- **No new write routing.** Nothing in this spec writes the IR or routes a surface through any seam. The guardrail reads graph/manifest/registry shapes only.
- **No contracts bump.** No `@keyboard-studio/contracts` change, no new `KeyboardIR` field, no §18 sign-off. All entities are existing symbols (`buildManifestStepGraph`, `buildModularFlowGraph`, `manifest`, `questionRegistry`, `findUnreachable`, `resolveNext`).
- **Behavior byte-identical.** No runtime/IR/render-path change; the SPA render path is untouched. Per D2a, the 016 diff is one new test file; the shared rendered-set helper is a 015 deliverable (consumed, not added, by 016).
- **No flag flip.** `VITE_KM_MUTATE_SEAM` and the dev-only flowmap flag are not touched.
- **Map-node requirement preserved.** The guardrail is precisely the mechanism that *enforces* "every reachable runtime step appears as a map node" — it does not weaken it.

## Components / files to touch

| File | Change | Notes |
|---|---|---|
| `packages/studio/src/dashboard/driftGuardrail.test.ts` (new, co-located) | **Add** the drift-guardrail test (positive bijection + negative tests + per-graph reachability). | Location **resolved (D1)** — its OWN new file in the dashboard tree, beside `completeness.test.ts`, **importing `buildManifestStepGraph` directly** (depcruise-safe: test files are excluded per `.dependency-cruiser.cjs:123-126`). A separate file (not added to `buildStepGraph.test.ts`) keeps the distinction from the C8/C9 block (`:323-356`) structural. Must NOT modify or re-assert C8/C9 (FR-009, FR-012). |
| (read-only) `packages/studio/src/dashboard/buildStepGraph.ts` | None — imported. `buildManifestStepGraph` (`:237`), `buildGraphFromQuestions` edge set (`:84-112`), `computeReserveNodes` (`:150-182`, NOT used by the bijection). | Whether the test imports `buildManifestStepGraph` directly is part of D1; a test file is not on the `completeness.ts:526` cycle. |
| (read-only) `packages/studio/src/dashboard/completeness.ts` | None — imported. `findUnreachable` (`:475-499`) for editor-step reachability. | |
| (read-only) `packages/studio/src/survey/SurveyRunner.tsx` | None — imported. `resolveNext` (exported, exercised in `SurveyRunner.test.ts`) for survey-question reachability. | |
| (read-only) `packages/studio/src/steps/manifest.ts` | None — imported. `manifest` step ids; opaque `charactersStep` placeholder (`:47-56`). | |
| (read-only) `packages/studio/src/survey/questions/registry.ts` | None — imported. `questionRegistry` (`:25`) across `registry.a/b/f`. | |
| (read-only) `packages/studio/src/dashboard/DashboardView.tsx` | None — imported. `FLOW_SOURCES` (`:48-54`), `buildModularFlowGraph` drill-down construction. | **D2 = D2a (re-run builders in-test); the snapshot route (D2b) is rejected.** The guardrail imports the EXACT builders `DashboardView` composes, not a re-derivation. |
| **Shared rendered-set helper (upstream-015 dependency, D2a precondition)** | **Required, but landed by 015, not 016.** A single exported function in `dashboard/` that assembles the rendered node set (015 adapter output ∪ `buildModularFlowGraph(FLOW_SOURCES)` drill-down ids), consumed by BOTH `DashboardView` and the guardrail. | If 015 inlines the assembly in `DashboardView`'s render body, 016 re-derives it and the guardrail becomes a second composition that can drift — this is a handoff to the 015 owner (015 DEC-001 still open). The helper imports only `steps/` + `survey/` leaves (no `stores/`/`editors/`); `pnpm depcruise` must stay green on it. |

## Design

### 1. Build the rendered node set (FR-001, FR-002)

The dashboard's rendered node set post-015 is two parts unioned:

- **Spine adapter nodes** — the `StepGraph`→`FlowGraph`/`GraphNode` adapter (delivered by 015) over `buildManifestStepGraph()`; one node per manifest entry (`kind:'stub'` for editor-steps).
- **Drill-down nodes** — `buildModularFlowGraph` over `FLOW_SOURCES` (`DashboardView.tsx:48-54`), keyed by `questionRegistry`, hung under the opaque `characters` node.

**D2 — RESOLVED: D2a (re-run the builders in-test).** Call the 015 adapter over `buildManifestStepGraph()` ∪ `buildModularFlowGraph` over `FLOW_SOURCES` directly in the test, collect node ids, and feed the pure helper of §4. **Import the EXACT builders `DashboardView` composes — do not re-derive them.** D2a is deterministic, fast, React-free, and store-free-preserving.
- **D2b (snapshot `DashboardView`) — rejected.** It couples to view internals, would need a helper to expose the graph from a deliberately store-free component (`DashboardView.tsx:11-14`), risks the dashboard-layer depcruise rule (`:83-93`), and does not match reality: `FlowMapView` renders N per-flow `FlowGraph`s via `.map(FLOW_SOURCES)` and never hands over one unified graph, so D2b pays full cost for no fidelity gain.
- **D2a precondition (FR-002):** D2a is faithful only if the rendered-set composition is factored into ONE shared exported function consumed by BOTH `DashboardView` and the guardrail (see the components table). If 015 inlines the assembly, 016 re-derives it and the guardrail can drift — an upstream handoff to the 015 owner (015 DEC-001 open). The shared helper lives in `dashboard/`, imports only `steps/` + `survey/` leaves (no `stores/`/`editors/`), and is analyzed by depcruise.

### 2. Build the runtime-reach set, per-graph (FR-003, FR-007, FR-008)

- **Editor-step reach:** `findUnreachable(manifest)` returns the unreachable ids; the reachable set is `manifest ids \ findUnreachable(manifest)` — spine-or-transitive-`joinTarget` (`completeness.ts:475-499`).
- **Survey-question reach:** walk the `buildGraphFromQuestions` edge set (`buildStepGraph.ts:84-112`) from each flow entry using `resolveNext` over `next` / `FlowGotoRule[]`; collect reachable `questionRegistry` ids. `findUnreachable` is **not** reused here — it is blind to `FlowGotoRule` branching.
- **Union** the two sets → the runtime-reach set.
- **`pb_build_list`** is asserted reachable in the **question** graph (reached as the build-list branch behind the mandatory IntroChooser gate, `PhaseB.tsx` ~`744`), confirming the boundary-crossing step is covered there (FR-008).

### 3. Assert the bijection (FR-001, FR-009)

`rendered === runtimeReach` as sets: every rendered node id has a runtime step, every runtime-reachable id has a rendered node. On a violation, fail with a message naming the orphan/uncovered id (mirrors the C8 ghost/missing messaging style, but over the REAL bijection — not the tautology). The reserve/library set (registered-but-unreachable registry ids, rendered by `computeReserveNodes`) is **excluded** from both sides — the bijection is over the reachable set only.

### 4. Negative tests (FR-004, FR-005, FR-006)

Inject divergence into a **guardrail-local clone** of the inputs (NOT the real `manifest`/`registry`):
- **N1 — uncovered manifest step:** add a synthetic manifest step (reachable per `findUnreachable`) with no registry/YAML coverage and no rendered drill-down; assert the bijection check reports it RED.
- **N2 — orphan registry id:** add a synthetic reachable `questionRegistry` id with no rendered node; assert RED.
Both assert "the guardrail goes RED" by invoking the bijection-checking function (factored as a pure helper) over the cloned inputs and expecting a non-empty violation set. Removing the injection returns the helper to GREEN against real data (FR-006).

> Factor the bijection check into a **pure function** `(rendered: Set<string>, runtimeReach: Set<string>) => violations` so the negative tests can drive it with cloned/injected sets without touching real `manifest`/`registry` — this is the cleanest way to make N1/N2 demonstrably RED while `main` stays GREEN.

## Intra-spec sequencing

This spec is foundation piece (b), landing **second** in Phase 1 (§2.4 step 2), immediately after 015 (map-projection) and **before** 017 (declare-only). Sequencing rationale: lock the invariant in before any step adds/moves declared contracts behind it, so a later declare/wire PR that introduces drift turns the guardrail RED.

**Upstream-015 build-order dependency (hard blocker on WRITING, not on the decisions).** Spec 015 is not yet landed: no `StepGraph`→`FlowGraph` adapter exists, and `DashboardView` currently builds the flow section from `FLOW_SOURCES` only, never calling `buildManifestStepGraph` — so T001's assumption is not yet true. The guardrail cannot be written until 015 lands the adapter + `DashboardView` projection AND 015 DEC-001 (adapter shape) is finalized AND the D2a shared rendered-set helper exists. The D1/D2 decisions above are settled now and do not wait on 015; only implementation does.

Note for the downstream 017 spec (writes-before-inputs): 017 must declare `writes` before `inputs` so C5 never transiently reds (§2.4 step 3). **That sequencing is 017's concern, not this spec's** — this guardrail does not assert C5 and must not require it green (FR-012). Called out here only so the reader knows the boundary.

## Flag gating

None. This spec flips no flag. The dev-only flowmap flag that gates the 015 projection is a 015 concern; the guardrail asserts against the node set 015 produces and does not itself toggle any flag.

## Byte-identical-behavior + map-node preservation

- **Byte-identical:** the only artifact is a test (plus an optional test-only helper from D2). No runtime, IR, render, reducer, or contracts code changes. Flag-off / render / emit output is unchanged.
- **Map-node requirement:** the guardrail is the enforcement of "every reachable runtime step appears as a map node." It strengthens, never weakens, that invariant — a missing map node for a reachable step is exactly the failure FR-001/SC-002/SC-003 require.

## Verification

`pnpm typecheck` + studio/contracts `vitest` (incl. the new guardrail, GREEN on `main`; the negative tests assert RED on injection) + `pnpm depcruise` (no new forbidden boundary; dashboard stays store-free). Confirm the new guardrail is distinct from `buildStepGraph.test.ts:323-356` (the C8/C9 block is left untouched) and demonstrably catches drift the C8/C9 block cannot.

**Empirical depcruise result (D1):** the direct `buildManifestStepGraph` import from the new test file is safe — `pnpm depcruise` baseline is 451 modules / 1357 deps, and adding a probe `*.test.ts` importing `buildManifestStepGraph` left the module count at 451, because `.dependency-cruiser.cjs:123-126` (`\.test\.[tj]sx?$`) excludes test files from analysis, so `no-circular` never sees the import.

**Post-015 re-run gates:** `pnpm install && pnpm depcruise` must be green with the new test file present AND on any non-test shared helper added for D2a; negative tests N1/N2 must go RED on injection / GREEN on removal (FR-006 / SC-007 / T002 / T018).

## Decisions (RESOLVED 2026-06-29, Matthew Lee / km-lead panel)

- **D1 — test location & import boundary → RESOLVED.** Its OWN co-located file in the dashboard tree (`dashboard/driftGuardrail.test.ts`, beside `completeness.test.ts`), importing `buildManifestStepGraph` directly via the 015 adapter. A separate file keeps the distinction from the C8/C9 tautology (`buildStepGraph.test.ts:323-356`) structural rather than reader-discipline. The direct import is depcruise-safe (empirical: 451 modules unchanged; test files excluded per `.dependency-cruiser.cjs:123-126`). FR-010 reading ratified: `dashboard/` is "the established guard tree" (manifest.test.ts in `steps/`, completeness.test.ts in `dashboard/` — not a single folder).
- **D2 — representation of "the node set the dashboard actually renders" → RESOLVED: D2a.** Re-run the EXACT builders `DashboardView` composes in-test (015 adapter over `buildManifestStepGraph()` ∪ `buildModularFlowGraph` over `FLOW_SOURCES`), collect node ids, feed the pure §4 helper. D2b (snapshot) rejected (couples to view internals, no fidelity gain). **Precondition:** the rendered-set composition must be a single shared exported function consumed by both `DashboardView` and the guardrail — an upstream handoff to the 015 owner (015 DEC-001 open).

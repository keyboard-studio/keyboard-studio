# Implementation Plan: Drift guardrail — CI bijection between the rendered graph and manifest + questionRegistry runtime reach

**Spec**: [spec.md](./spec.md) · **Branch**: `speckit/question-unification-phase1-specs` · **Migration plan**: [question-unification-migration-plan.md](../../docs/design-notes/question-unification-migration-plan.md) §2.2(b), §2.4 step 2, §2.5, §4, §5 spec #2

## Summary

Add a single CI test — the **drift guardrail** — that asserts a bijection between the node set the dashboard ACTUALLY renders (post-015: the `StepGraph`→`FlowGraph`/`GraphNode` adapter output over `buildManifestStepGraph()` plus the `buildModularFlowGraph` drill-downs keyed by `questionRegistry`) and the union of manifest step ids + runtime-reachable `questionRegistry` ids. The set is computed **per-graph**: manifest editor-steps via `findUnreachable` (`completeness.ts:475-499`), survey questions via `resolveNext` over `next` / `FlowGotoRule[]` (the `buildGraphFromQuestions` edge set, `buildStepGraph.ts:84-112`); both run. A negative test injects (a) an uncovered manifest step and (b) an orphan registry id and asserts each turns the guardrail RED. This is **test-only**: no contracts bump, no new write routing, no flag flip, behavior byte-identical.

## Phase-1 invariants (threaded through every component)

- **No new write routing.** Nothing in this spec writes the IR or routes a surface through any seam. The guardrail reads graph/manifest/registry shapes only.
- **No contracts bump.** No `@keyboard-studio/contracts` change, no new `KeyboardIR` field, no §18 sign-off. All entities are existing symbols (`buildManifestStepGraph`, `buildModularFlowGraph`, `manifest`, `questionRegistry`, `findUnreachable`, `resolveNext`).
- **Behavior byte-identical.** No runtime/IR/render-path change; the SPA render path is untouched. The diff is one test file (plus, if D2 resolves that way, a tiny test-only helper exposing the rendered node set).
- **No flag flip.** `VITE_KM_MUTATE_SEAM` and the dev-only flowmap flag are not touched.
- **Map-node requirement preserved.** The guardrail is precisely the mechanism that *enforces* "every reachable runtime step appears as a map node" — it does not weaken it.

## Components / files to touch

| File | Change | Notes |
|---|---|---|
| `packages/studio/src/dashboard/buildStepGraph.test.ts` **or** a new co-located guardrail test | **Add** the drift-guardrail test (positive bijection + negative tests + per-graph reachability). | Physical location is **[NEEDS DECISION: D1]** — co-locate near the C8/C9 block (`buildStepGraph.test.ts:323-356`) it must out-cover, or beside `completeness.test.ts` / `manifest.test.ts` (FR-010). Must NOT modify or re-assert the C8/C9 block (FR-009, FR-012). |
| (read-only) `packages/studio/src/dashboard/buildStepGraph.ts` | None — imported. `buildManifestStepGraph` (`:237`), `buildGraphFromQuestions` edge set (`:84-112`), `computeReserveNodes` (`:150-182`, NOT used by the bijection). | Whether the test imports `buildManifestStepGraph` directly is part of D1; a test file is not on the `completeness.ts:526` cycle. |
| (read-only) `packages/studio/src/dashboard/completeness.ts` | None — imported. `findUnreachable` (`:475-499`) for editor-step reachability. | |
| (read-only) `packages/studio/src/survey/SurveyRunner.tsx` | None — imported. `resolveNext` (exported, exercised in `SurveyRunner.test.ts`) for survey-question reachability. | |
| (read-only) `packages/studio/src/steps/manifest.ts` | None — imported. `manifest` step ids; opaque `charactersStep` placeholder (`:47-56`). | |
| (read-only) `packages/studio/src/survey/questions/registry.ts` | None — imported. `questionRegistry` (`:25`) across `registry.a/b/f`. | |
| (read-only) `packages/studio/src/dashboard/DashboardView.tsx` | None unless D2 picks the snapshot route. `FLOW_SOURCES` (`:48-54`), `buildModularFlowGraph` drill-down construction. | If D2 chooses "re-run the 015 adapter in-test," a small exported helper may be needed (test-only). |
| (optional, D2) a test-only helper exposing "the rendered node set" | **Add only if D2 requires it.** | Keep it test-scoped / props-only; dashboard must stay store-free (`DashboardView.tsx:11-14`); `pnpm depcruise` must stay green. |

## Design

### 1. Build the rendered node set (FR-001, FR-002)

The dashboard's rendered node set post-015 is two parts unioned:

- **Spine adapter nodes** — the `StepGraph`→`FlowGraph`/`GraphNode` adapter (delivered by 015) over `buildManifestStepGraph()`; one node per manifest entry (`kind:'stub'` for editor-steps).
- **Drill-down nodes** — `buildModularFlowGraph` over `FLOW_SOURCES` (`DashboardView.tsx:48-54`), keyed by `questionRegistry`, hung under the opaque `characters` node.

**[NEEDS DECISION: D2]** — two candidate representations:
- **D2a (re-run the adapter in-test):** call the 015 adapter + `buildModularFlowGraph` directly in the test and collect node ids. Pro: no React render, deterministic, fast. Con: must stay faithful to what `DashboardView` actually composes (mitigated by importing the same builders `DashboardView` uses, not re-deriving).
- **D2b (snapshot the `DashboardView` graph output):** render `DashboardView` (props-only) and read the graph it hands to `FlowGraphView`. Pro: asserts the literal render path. Con: heavier; risks coupling to view internals.
Recommendation to validate in planning: D2a importing the exact builders `DashboardView` uses, so "rendered" cannot drift from "asserted" by construction. Resolve before implementation.

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

Note for the downstream 017 spec (writes-before-inputs): 017 must declare `writes` before `inputs` so C5 never transiently reds (§2.4 step 3). **That sequencing is 017's concern, not this spec's** — this guardrail does not assert C5 and must not require it green (FR-012). Called out here only so the reader knows the boundary.

## Flag gating

None. This spec flips no flag. The dev-only flowmap flag that gates the 015 projection is a 015 concern; the guardrail asserts against the node set 015 produces and does not itself toggle any flag.

## Byte-identical-behavior + map-node preservation

- **Byte-identical:** the only artifact is a test (plus an optional test-only helper from D2). No runtime, IR, render, reducer, or contracts code changes. Flag-off / render / emit output is unchanged.
- **Map-node requirement:** the guardrail is the enforcement of "every reachable runtime step appears as a map node." It strengthens, never weakens, that invariant — a missing map node for a reachable step is exactly the failure FR-001/SC-002/SC-003 require.

## Verification

`pnpm typecheck` + studio/contracts `vitest` (incl. the new guardrail, GREEN on `main`; the negative tests assert RED on injection) + `pnpm depcruise` (no new forbidden boundary; dashboard stays store-free). Confirm the new guardrail is distinct from `buildStepGraph.test.ts:323-356` (the C8/C9 block is left untouched) and demonstrably catches drift the C8/C9 block cannot.

## Open decisions

- **[NEEDS DECISION: D1]** — test physical location and whether it imports `buildManifestStepGraph` directly (`completeness.ts:526` avoids that import for a circular-dep reason that does not bind a test file). Resolve against `pnpm depcruise` during planning.
- **[NEEDS DECISION: D2]** — representation of "the node set the dashboard actually renders": re-run the 015 adapter in-test (D2a) vs snapshot the `DashboardView` graph output (D2b).

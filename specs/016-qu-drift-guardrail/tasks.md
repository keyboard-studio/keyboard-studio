# Tasks: Drift guardrail — CI bijection between the rendered graph and manifest + questionRegistry runtime reach

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Branch**: `speckit/question-unification-phase1-specs`

> Phase-1 invariants apply to every task: **no new write routing, no contracts bump, no flag flip, behavior byte-identical.** This is a test-only spec. Each task is small and testable; the verification tasks come last (per §2.5 test strategy).

## Group A — Prerequisites & decisions

- [x] **T001** **DONE (2026-06-29, km-implementer):** spec `015-qu-map-projection` is landed and stable (PR #864 merged). The `StepGraph`→`FlowGraph`/`GraphNode` adapter (`dashboard/manifestProjection.ts`: `buildManifestProjection`, `attachDrillDowns`, `CHARACTERS_STEP_ID`) over `buildManifestStepGraph()` and the `buildModularFlowGraph` drill-downs keyed by `questionRegistry` exist, and `DashboardView`/`FlowMapView` consumes them (spine projection + drill-downs). **The "Upstream-015 blocker / 015 not yet landed" note below is STALE and superseded** — 015 IS on main. 015 shipped WITHOUT the D2a shared flat-rendered-node-id-set helper, so this 016 PR lands it (`dashboard/renderedNodeSet.ts`, see T003/T004).
- [x] **T002** **RESOLVED (D1, 2026-06-29, Matthew Lee / km-lead panel):** the guardrail lives in **its OWN co-located file in the dashboard tree** (`dashboard/driftGuardrail.test.ts`, beside `completeness.test.ts`) and **imports `buildManifestStepGraph` directly** via the 015 adapter. A separate file (not an addition to `buildStepGraph.test.ts`) keeps the distinction from the C8/C9 tautology (`:323-356`) structural rather than reader-discipline. Depcruise-safe — confirmed empirically: baseline 451 modules / 1357 deps, unchanged by a probe test importing `buildManifestStepGraph`, because `.dependency-cruiser.cjs:123-126` (`\.test\.[tj]sx?$`) excludes test files from analysis. FR-010 reading ratified: `dashboard/` is "the established guard tree" (`manifest.test.ts` in `steps/`, `completeness.test.ts` in `dashboard/` — not a single folder). **Post-015 re-run gate:** with the new test file present, `pnpm install && pnpm depcruise` must stay green.
- [x] **T003** **RESOLVED (D2 = D2a, 2026-06-29, Matthew Lee / km-lead panel):** obtain "the node set the dashboard actually renders" by **re-running the EXACT builders `DashboardView` composes in-test** — the 015 adapter over `buildManifestStepGraph()` ∪ `buildModularFlowGraph` over `FLOW_SOURCES` — collecting node ids and feeding the pure helper (T008). **Do NOT re-derive the builders.** D2b (snapshot `DashboardView`) is rejected (couples to view internals, no fidelity gain). **D2a precondition (upstream-015 dependency, handoff to the 015 owner — 015 DEC-001 open):** the rendered-set composition (015 adapter output ∪ `buildModularFlowGraph(FLOW_SOURCES)` drill-down ids) MUST be factored into ONE shared exported function consumed by BOTH `DashboardView` and the guardrail; otherwise 016 re-derives it and the guardrail becomes a second, drifting composition. Any such helper lives in `dashboard/`, imports only `steps/` + `survey/` leaves (no `stores/`/`editors/`), and is itself analyzed by depcruise. **Post-015 re-run gate:** `pnpm install && pnpm depcruise` must be green on that non-test shared helper.

## Group B — Build the two node sets (helpers)

- [x] **T004** **DONE:** rendered node-id set via the shared helper `collectRenderedNodeIds(flows)` (`dashboard/renderedNodeSet.ts`, the D2a precondition landed by THIS PR): 015 spine adapter output over `buildManifestStepGraph()` ∪ `buildModularFlowGraph` drill-down node ids keyed by `questionRegistry` (reserve/library excluded). `DashboardView` is refactored to import `FLOW_SOURCES`/`safeBuild` from the same helper. Exact builders reused, not re-derived. (FR-001, FR-002)
- [x] **T005** **DONE:** editor-step reach = `manifest` ids minus `findUnreachable(manifest)` (`driftGuardrail.test.ts` `computeEditorReach`). (FR-007)
- [x] **T006** **DONE:** survey-question reach (`computeSurveyReach`): BFS from each flow entry over the structural goto-target set (`resolveNext` exercised for linear next; all `FlowGotoRule` targets enumerated — the `buildGraphFromQuestions` edge set), collecting reachable `questionRegistry` ids. Does NOT reuse `findUnreachable`. (FR-007)
- [x] **T007** **DONE:** `runtimeReach = union(editorReach, surveyReach)`. (FR-003)
- [x] **T008** **DONE:** pure `bijectionViolations(rendered, runtimeReach) => { orphanRendered, uncovered }` in `driftGuardrail.test.ts`; the negatives drive it with cloned/injected sets, real `manifest`/`registry` untouched. (FR-006, plan §4)

## Group C — Positive guardrail (US1)

- [x] **T009** **DONE:** positive bijection assertion `rendered === runtimeReach` (SC-001 test), message names orphan/uncovered ids; reserve/library set excluded by `collectRenderedNodeIds` (skips `kind:"library-not-in-flow"`). (FR-001, US1 AC-1)
- [x] **T010** **DONE:** distinct file (`dashboard/driftGuardrail.test.ts`); the C8/C9 block (`buildStepGraph.test.ts:323-356`) is untouched (zero diff). A dedicated test (`D1 / FR-009`) documents the contrast without re-asserting the identity. (FR-009, FR-012)

## Group D — Per-graph reachability assertions (US3)

- [x] **T011** **DONE:** asserts `editorReach.size > 0` AND `surveyReach.size > 0`, and that the union strictly grows (the two id spaces are disjoint), proving both contribute. (FR-007, SC-004)
- [x] **T012** **DONE (reconciliation RATIFIED in spec.md, 2026-06-29 km archivist):** no `pb_build_list` id exists on main — it is the `BuildListView` React branch (`survey/PhaseB.tsx:535`), not a `questionRegistry` id, so it cannot be asserted in the question graph. FR-008/SC-005/US3/Key-Entities were amended to name `pb_discovery_intro` (the IntroChooser/discovery gate fronting the build-list branch; `registry.b.ts:74`, reached as a string-`next` target from `pb_co_installed_keyboards.ts:17`). The test asserts `pb_discovery_intro` IS in the **question**-graph reach (`surveyReach`) and IS NOT in the manifest/`findUnreachable` reach (`editorReach`) — verified in the question graph, not the manifest graph. (FR-008, SC-005)

## Group E — Negative tests (US2)

- [x] **T013** **DONE:** N1 injects a synthetic uncovered runtime id into a CLONE of `runtimeReach`; `bijectionViolations` reports it in `uncovered` (RED). (FR-004, SC-002)
- [x] **T014** **DONE:** N2 injects a synthetic orphan rendered id into a CLONE of `rendered`; `bijectionViolations` reports it in `orphanRendered` (RED). (FR-005, SC-003)
- [x] **T015** **DONE:** both negatives assert the injected id is absent from the real sets and that the real sets produce empty violations (GREEN); a `baseline` test re-asserts GREEN on real data. (FR-006)

## Group F — Verification (last, per §2.5)

- [x] **T016** **DONE:** `vitest` — studio 2542 tests pass (incl. the 8 guardrail tests GREEN), contracts 354 pass. Negatives assert RED on injection (helper-level) and a live source-level manifest injection turned SC-001 RED (then reverted). (SC-001, SC-007)
- [x] **T017** **DONE:** `pnpm typecheck` — green (all packages). (SC-007)
- [x] **T018** **DONE:** `pnpm depcruise` — green, 595 modules / 1642 deps, no violations. The new `*.test.ts` is excluded; the non-test `dashboard/renderedNodeSet.ts` is analyzed and imports only dashboard/ siblings + `survey/questions/registry*` + `survey/types` + the yaml `?raw` sources (NO stores/editors). (SC-007)
- [x] **T019** **DONE:** no contracts change, no flag flip, no write-routing change; the C8/C9 block and all render JSX are byte-identical (only the source of `FLOW_SOURCES`/composition moved into the shared helper). Only diffs: new helper, new test, DashboardView import refactor. (FR-011, SC-008)
- [x] **T020** **DONE:** proven — a real off-spine manifest step with no joinTarget (unreachable per `findUnreachable`, still projected/rendered) turned SC-001 RED naming the orphan id, while C8/C9 (manifest vs `buildManifestStepGraph`, both reading the same array) would stay green. Reverted after proof. (FR-009, SC-006)

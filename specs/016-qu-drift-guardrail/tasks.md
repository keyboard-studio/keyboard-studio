# Tasks: Drift guardrail — CI bijection between the rendered graph and manifest + questionRegistry runtime reach

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Branch**: `speckit/question-unification-phase1-specs`

> Phase-1 invariants apply to every task: **no new write routing, no contracts bump, no flag flip, behavior byte-identical.** This is a test-only spec. Each task is small and testable; the verification tasks come last (per §2.5 test strategy).

## Group A — Prerequisites & decisions

- [ ] **T001** Confirm spec `015-qu-map-projection` is landed and stable: the `StepGraph`→`FlowGraph`/`GraphNode` adapter over `buildManifestStepGraph()` and the `buildModularFlowGraph` drill-downs keyed by `questionRegistry` exist and `DashboardView` consumes them. (Dependency — the rendered graph must exist first.)
- [ ] **T002** Resolve **[NEEDS DECISION: D1]** — pick the test's physical location (co-located with the C8/C9 block in `buildStepGraph.test.ts`, or beside `completeness.test.ts` / `manifest.test.ts` per FR-010) and decide whether it imports `buildManifestStepGraph` directly. Verify the choice against `pnpm depcruise` (a test file is not on the `completeness.ts:526` circular-dep cycle).
- [ ] **T003** Resolve **[NEEDS DECISION: D2]** — choose how to obtain "the node set the dashboard actually renders": re-run the 015 adapter + `buildModularFlowGraph` in-test (D2a) vs snapshot the `DashboardView` graph output (D2b). Prefer importing the exact builders `DashboardView` uses so "rendered" cannot drift from "asserted".

## Group B — Build the two node sets (helpers)

- [ ] **T004** Implement (or import) a function that returns the **rendered node-id set**: the 015 spine adapter output over `buildManifestStepGraph()` PLUS the `buildModularFlowGraph` drill-down node ids keyed by `questionRegistry`, per the D2 decision. (FR-001, FR-002)
- [ ] **T005** Implement editor-step reachability: `manifest` ids minus `findUnreachable(manifest)` (spine-or-transitive-`joinTarget`, `completeness.ts:475-499`). (FR-007)
- [ ] **T006** Implement survey-question reachability: walk the `buildGraphFromQuestions` edge set (`buildStepGraph.ts:84-112`) from each flow entry using `resolveNext` over `next` / `FlowGotoRule[]` (`survey/SurveyRunner.tsx`); collect reachable `questionRegistry` ids. Do NOT reuse `findUnreachable` here (it is blind to `FlowGotoRule`). (FR-007)
- [ ] **T007** Union the editor-step reach (T005) and survey-question reach (T006) into the **runtime-reach set**. (FR-003)
- [ ] **T008** Factor the bijection check into a **pure function** `(rendered: Set<string>, runtimeReach: Set<string>) => violations` (orphan rendered nodes + uncovered runtime steps), so the negative tests can drive it with injected sets without touching real `manifest`/`registry`. (FR-006, plan §4)

## Group C — Positive guardrail (US1)

- [ ] **T009** Add the positive bijection assertion: `rendered === runtimeReach` as sets, failing with a message naming the orphan/uncovered id. Exclude the reserve/library set (registered-but-unreachable registry ids rendered by `computeReserveNodes`) from both sides. (FR-001, US1 AC-1)
- [ ] **T010** Confirm the guardrail is **distinct from** the C8/C9 block (`buildStepGraph.test.ts:323-356`) and does not modify or re-assert it. (FR-009, FR-012)

## Group D — Per-graph reachability assertions (US3)

- [ ] **T011** Assert both reachability computations run and contribute to the union (editor-steps via `findUnreachable`; survey questions via `resolveNext`). (FR-007, SC-004)
- [ ] **T012** Assert `pb_build_list` (build-list branch reached via the mandatory IntroChooser gate, `PhaseB.tsx` ~`744`) is verified in the **question** graph via `resolveNext`, not the manifest graph. (FR-008, SC-005)

## Group E — Negative tests (US2)

- [ ] **T013** Negative test N1: inject a synthetic **uncovered manifest step** (reachable per `findUnreachable`, no registry/YAML coverage, no rendered drill-down) into a guardrail-local clone; assert the bijection helper (T008) reports it RED. (FR-004, SC-002)
- [ ] **T014** Negative test N2: inject a synthetic **orphan `questionRegistry` id** (reachable, no rendered node) into a guardrail-local clone; assert the bijection helper reports it RED. (FR-005, SC-003)
- [ ] **T015** Assert the injections are **local** (real `manifest`/`registry` untouched) and that removing them returns the helper to GREEN against real data. (FR-006)

## Group F — Verification (last, per §2.5)

- [ ] **T016** Run studio/contracts `vitest`: the new guardrail is GREEN on unmodified `main`; the negative tests assert RED on injection. (SC-001, SC-007)
- [ ] **T017** Run `pnpm typecheck` — green. (SC-007)
- [ ] **T018** Run `pnpm depcruise` — green; the test introduces no new forbidden dependency boundary (dashboard stays store-free; D1/D2 helpers, if any, are test-scoped). (SC-007)
- [ ] **T019** Confirm Phase-1 invariants: no contracts change, no flag flip, no write-routing change; flag-off / runtime / render output byte-identical to pre-016 (only diff is the added test + any D2 test-only helper). (FR-011, SC-008)
- [ ] **T020** Confirm the guardrail catches the §1 drift the C8/C9 tautology cannot — i.e. the negative tests go RED in a scenario where `buildStepGraph.test.ts:323-356` would stay green. (FR-009, SC-006)

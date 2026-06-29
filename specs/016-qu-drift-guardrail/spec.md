# Feature Specification: Drift guardrail — CI bijection between the rendered graph and manifest + questionRegistry runtime reach

**Feature Branch**: `speckit/question-unification-phase1-specs`

**Created**: 2026-06-29

**Status**: **Ready** — Phase 1 spec (opaque-step import). This is spec #2 of the question-unification Phase-1 decomposition ([docs/design-notes/question-unification-migration-plan.md](../../docs/design-notes/question-unification-migration-plan.md) §5). It is a read-only, test-only feature: no contracts bump, no new write routing, behavior byte-identical. Depends on spec #1 `015-qu-map-projection` (the rendered graph this guardrail asserts against must exist first).

**Input**: User description: Add the CI **drift guardrail** that enforces the §1 invariant — the node set the dashboard ACTUALLY renders (post-015: the `buildManifestStepGraph` spine adapter + the `buildModularFlowGraph` drill-downs keyed by `questionRegistry`) is **bijective** with the union of manifest step ids + `questionRegistry` ids the runtime reaches. This is explicitly NOT the pre-existing **tautological** test at `buildStepGraph.test.ts:323-356` (the C8/C9 block, which maps the same `manifest` array against itself and can never catch YAML/registry/manifest drift).

**Governing scope**: This feature implements **foundation piece (b)** of Phase 1 of the Question Unification migration ([docs/design-notes/question-unification-migration-plan.md](../../docs/design-notes/question-unification-migration-plan.md) §2.2(b), §2.4 step 2, §2.5, §4, §5 spec #2), operationalizing the §1 enforcement gate ("any divergence between the node set the dashboard renders and the union of manifest step ids + `questionRegistry` ids the runtime reaches is a CI failure, not a silent divergence"). It does not re-derive that scope. Spec #1 ([specs/015-qu-map-projection](../015-qu-map-projection/spec.md)) is the landed prerequisite this feature builds on; this spec locks the invariant in **before** the declare-only (017) and component-wire (018+) steps add or move contracts behind it.

> **Note on the distinction from the existing test (deliberate, load-bearing).** A near-identical trivial test ALREADY exists at `buildStepGraph.test.ts:323-356` (labelled C8/C9, "buildManifestStepGraph — C8/C9 (T032)"). It asserts `buildManifestStepGraph()` node ids == `manifest` step ids. That bijection is a **tautology**: `buildManifestStepGraph` maps over the same `manifest` array (`buildStepGraph.ts:237-244`), and `findUnreachable` (`completeness.ts:475-499`) reads the same manifest — so it can never catch the drift §1 indicts (the `*.modular.yaml` survey questions vs the manifest; the whole Phase A/B battery is one opaque `charactersStep` placeholder, `manifest.ts:47-56`). **The new guardrail is NOT that test and MUST NOT re-assert it.** It asserts the bijection between the node set the dashboard ACTUALLY renders (the 015 adapter output PLUS the `buildModularFlowGraph` drill-downs keyed by `questionRegistry`) and the union of manifest step ids + runtime-reachable `questionRegistry` ids.

## Clarifications

### Session 2026-06-29

These are the Phase-1 invariants threaded through this spec; all are settled by the migration plan (Matt's 2026-06-29 Phase-1 scope confirmation, §6) and require no `[NEEDS CLARIFICATION]` marker:

- **No new write routing.** This spec is test-only. It adds no IR write path, flips no flag, and touches no reducer. (§2 Phase 1 constraint.)
- **No contracts bump.** No `@keyboard-studio/contracts` change; no new `KeyboardIR` field; no §18 sign-off. The guardrail reads existing `StepGraph` / `FlowGraph` / manifest / `questionRegistry` shapes only. (§2 Phase 1 constraint.)
- **Behavior byte-identical.** No runtime/IR/render-path change; the SPA render path is untouched. The only artifact is a new test (and, if needed, a tiny test-only helper to expose the rendered node set). (§2.4 step 5, §4.)
- **Per-graph reachability, both run.** Manifest editor-steps use `findUnreachable`'s spine-or-transitive-`joinTarget` rule (`completeness.ts:475-499`); survey questions use reachable-from-flow-entry via `resolveNext` over `next` / `FlowGotoRule[]` (the `buildGraphFromQuestions` edge set, `buildStepGraph.ts:84-112`). `findUnreachable` is blind to `FlowGotoRule` branching, so BOTH computations run. (§2.2(b).)

### Open items requiring a planning decision

These were surfaced as `[NEEDS DECISION]` for `/speckit-plan`; both are now **RESOLVED** (Matthew Lee, 2026-06-29, km-lead panel review):

- **D1 — test location & import boundary** → **RESOLVED: its own co-located file in the dashboard tree** (e.g. `dashboard/driftGuardrail.test.ts`, beside `completeness.test.ts`), **importing `buildManifestStepGraph` directly** (via the 015 adapter). *Rationale*: co-locating inside `buildStepGraph.test.ts` next to the tautological C8/C9 block (`:323-356`) structurally invites re-asserting the manifest-vs-itself identity 016 is meant to replace (the FR-009/FR-012 hazard); a separate file makes the distinction structural rather than reader-discipline (a one-line comment can still point reviewers at the contrast). The direct import is safe and was confirmed empirically: `pnpm depcruise` baseline is 451 modules / 1357 deps, and adding a probe `*.test.ts` importing `buildManifestStepGraph` left the count at 451, because `.dependency-cruiser.cjs:123-126` (`\.test\.[tj]sx?$`) excludes test files from analysis, so `no-circular` never sees the import. Precedent: `buildStepGraph.test.ts:8` already imports it at green HEAD. **FR-010 reading (ratified):** `manifest.test.ts` lives in `steps/` and `completeness.test.ts` in `dashboard/`, so "co-locate with the guard tree" cannot mean a single folder; placing the guardrail in `dashboard/` (where the bijection machinery `buildManifestStepGraph`, `buildModularFlowGraph`, `findUnreachable` lives) satisfies FR-010 as "the established guard tree" — this is the intended reading, not an FR-010 miss.
- **D2 — representation of "the node set the dashboard actually renders"** → **RESOLVED: D2a (re-run the builders in-test).** Run the 015 `StepGraph`→`FlowGraph` adapter over `buildManifestStepGraph()` ∪ `buildModularFlowGraph` over `FLOW_SOURCES`, collect node ids, and feed a pure `(rendered, runtimeReach) => violations` helper (plan §4 / T008). **Import the EXACT builders `DashboardView` composes — do not re-derive them.** *Rationale*: D2b (snapshot `DashboardView`) couples to view internals, would need a helper to expose the graph from a deliberately store-free component (`DashboardView.tsx:11-14`), risks the dashboard-layer depcruise rule (`:83-93`), and does not match reality — `FlowMapView` renders N per-flow `FlowGraph`s via `.map(FLOW_SOURCES)` and never hands over one unified graph, so D2b pays full cost for no fidelity gain. D2a is deterministic, fast, React-free, and store-free-preserving. **D2a precondition (FR-002):** D2a satisfies FR-002 only if the rendered-set composition (015 adapter output ∪ `buildModularFlowGraph(FLOW_SOURCES)` drill-down ids) is factored into ONE shared exported function consumed by BOTH `DashboardView` and the guardrail. If 015 inlines the assembly in `DashboardView`'s render body, 016 will re-derive it and the guardrail becomes a second composition that can drift — this is a dependency/handoff to the 015 owner (015 DEC-001 is still open). Any such shared helper MUST live in `dashboard/`, import only `steps/` + `survey/` leaves (no `stores/`/`editors/`), and is itself analyzed by depcruise.

> **Upstream-015 dependency (build-order, not a blocker on the decision).** Spec 015 is not yet landed — no `StepGraph`→`FlowGraph` adapter exists and `DashboardView` currently builds the flow section from `FLOW_SOURCES` only, never calling `buildManifestStepGraph` (so T001's assumption is not yet true). The guardrail cannot be WRITTEN until 015 lands the adapter + `DashboardView` projection and 015 DEC-001 (adapter shape) is finalized. **Post-015 re-run gates:** `pnpm install && pnpm depcruise` must be green with the new test file present and on any non-test shared helper added for D2a; negative tests N1/N2 must go RED on injection / GREEN on removal (FR-006 / SC-007 / T002 / T018).

## User Scenarios & Testing *(mandatory)*

> The "users" here are the studio engineering team (who gain a construction-time guarantee that the map and the runtime cannot diverge) and reviewers (who get a test that turns RED the moment a later PR introduces drift). Each story is independently testable and independently valuable.

### User Story 1 - CI fails when the rendered node set diverges from manifest + questionRegistry runtime reach (Priority: P1)

A studio engineer wants CI to fail when the rendered map node set diverges from the manifest + `questionRegistry` runtime reach, so the single-source-of-truth invariant is enforced **by construction rather than by intent**.

**Why this priority**: This is the headline enforcement of the §1 invariant and the reason this spec exists. Spec #1 wired the dashboard to project the manifest; without this guardrail, the projection and the runtime can still silently drift in a later PR. Everything else in Phase 1 (declare-only 017, component-wire 018+) lands behind this gate.

**Independent Test**: Build the rendered node set (the 015 `StepGraph`→`FlowGraph`/`GraphNode` adapter output over `buildManifestStepGraph()` plus the `buildModularFlowGraph` drill-downs keyed by `questionRegistry`); build the runtime-reach set (manifest step ids reachable per `findUnreachable` ∪ `questionRegistry` ids reachable per `resolveNext`); assert the two sets are equal (bijection). On unmodified `main`, the assertion is GREEN.

**Acceptance Scenarios**:

1. **Given** the dashboard's rendered node set (015 adapter output + `questionRegistry` drill-downs) and the union of manifest step ids + runtime-reachable `questionRegistry` ids, **When** the guardrail runs, **Then** the two sets are asserted **equal** (every rendered node has a runtime step and every runtime-reachable step has a rendered node).
2. **Given** a rendered node with **no** runtime step, **When** the guardrail runs, **Then** it FAILS (RED) and names the orphan rendered node.
3. **Given** a runtime-reachable step with **no** rendered node, **When** the guardrail runs, **Then** it FAILS (RED) and names the uncovered step.
4. **Given** unmodified `main`, **When** `pnpm test` / CI runs, **Then** the guardrail is GREEN.

---

### User Story 2 - A negative test goes RED when a manifest step has no registry/YAML coverage, or an orphan registry id exists (Priority: P1)

A reviewer wants a **negative test** that goes RED when a manifest step has no registry/YAML coverage (or vice versa), so that drift cannot be introduced silently in a later PR.

**Why this priority**: A positive bijection assertion that only ever runs green on `main` gives weak confidence — a reviewer cannot tell whether it would actually catch drift. The negative test demonstrates the guardrail bites: an injected divergence (an uncovered manifest step OR an orphan registry id) must turn it RED. This is what distinguishes the new guardrail from the tautology at `buildStepGraph.test.ts:323-356`.

**Independent Test**: Inject a divergence into a guardrail-local fixture — (a) a manifest step with no registry/YAML coverage, and (b) an orphan `questionRegistry` id with no rendered node — and assert the guardrail's bijection check reports each as a failure. The injection is local to the test (it does NOT mutate the real `manifest`/`registry`).

**Acceptance Scenarios**:

1. **Given** a manifest step lacking registry/YAML coverage (injected into a guardrail fixture), **When** the bijection check runs, **Then** it FAILS (RED).
2. **Given** an orphan `questionRegistry` id with no rendered node (injected into a guardrail fixture), **When** the bijection check runs, **Then** it FAILS (RED).
3. **Given** the same injection, **When** the test asserts the negative case, **Then** the assertion confirms the guardrail goes RED (the divergence is detected, not silently passed).
4. **Given** the negative-test injection is removed, **When** the guardrail runs against the real `manifest`/`registry`, **Then** it returns to GREEN.

---

### User Story 3 - Reachability is defined per-graph (findUnreachable for editor-steps, resolveNext for survey questions) (Priority: P1)

A maintainer wants reachability defined **per-graph** — `findUnreachable` for manifest editor-steps, `resolveNext` over `next` / `FlowGotoRule[]` for survey questions — so that the guardrail correctly handles `FlowGotoRule` branching that `findUnreachable` is blind to. A boundary-crossing step (`pb_discovery_intro`, the discovery-method gate fronting the build-list branch; ratified stand-in for the originally named `pb_build_list` — see FR-008) is checked in the **question** graph.

**Why this priority**: `findUnreachable` (`completeness.ts:475-499`) only knows the manifest's spine / `joinTarget` rule — it has **no awareness** of `FlowGotoRule` branching. Applying it to survey questions would mis-classify branch reachability (e.g. the discovery gate `pb_discovery_intro` reached via the IntroChooser gate, fronting the build-list branch). Defining reachability per-graph and running BOTH computations is what makes the bijection correct rather than approximate.

**Independent Test**: For manifest editor-steps, compute reachability via `findUnreachable` (spine-or-transitive-`joinTarget`); for survey questions, compute reachability via `resolveNext` over `next` / `FlowGotoRule[]` (the `buildGraphFromQuestions` edge set, `buildStepGraph.ts:84-112`). Confirm both run and contribute to the union; confirm `pb_discovery_intro` (ratified stand-in for `pb_build_list` — see FR-008) is verified in the question graph (the discovery gate fronting the build-list branch), not the manifest graph.

**Acceptance Scenarios**:

1. **Given** the manifest editor-steps, **When** reachability is computed, **Then** it uses `findUnreachable`'s spine-or-transitive-`joinTarget` rule (`completeness.ts:475-499`).
2. **Given** the survey questions, **When** reachability is computed, **Then** it uses `resolveNext` over `next` / `FlowGotoRule[]` (the `buildGraphFromQuestions` edge set, `buildStepGraph.ts:84-112`), NOT `findUnreachable`.
3. **Given** the guardrail, **When** it runs, **Then** BOTH reachability computations execute and the union of their reachable ids is the runtime-reach set.
4. **Given** `pb_discovery_intro` (the discovery-method gate reached via the mandatory IntroChooser, fronting the build-list branch; ratified stand-in for `pb_build_list` — see FR-008), **When** the guardrail checks its reachability, **Then** it is verified in the **question** graph (via `resolveNext`), confirming the boundary-crossing step is covered.

---

### Edge Cases

- **A manifest editor-step that is off-spine but transitively joins the spine** (e.g. `project_name` → `joinTarget:"characters"`, `touch_seed_source` → `joinTarget:"touch"`): reached per `findUnreachable`'s transitive-`joinTarget` rule; it has a rendered node, so the bijection holds.
- **A `questionRegistry` id registered but NOT reachable from any flow entry** (a reserve/library module off the active branch): it is NOT in the runtime-reach set, so it must NOT be required to have a rendered active-flow node — it is rendered as a reserve node by a separate mechanism (`computeReserveNodes`, `buildStepGraph.ts:150-182`), which is out of scope here. The guardrail asserts the bijection over the **reachable** set, not the full registry. (No-delete library demotion is spec 022's concern, not this spec.)
- **A boundary-crossing step (`pb_discovery_intro`, ratified stand-in for `pb_build_list` — see FR-008)**: checked in the question graph (US3 AC-4); the discovery gate behind the IntroChooser fronting the build-list branch, so it must have a rendered drill-down node.
- **The opaque `charactersStep` placeholder** (`manifest.ts:47-56`): one manifest node that subsumes the Phase A/B survey questions. The guardrail must reconcile the single manifest node against the registry-keyed drill-down nodes the 015 adapter hangs under it — this is precisely the drift the tautological test cannot see, and the bijection must account for it (the drill-down node set is part of "the node set the dashboard actually renders").
- **An injected negative-test divergence**: must be local to the guardrail fixture (it must NOT mutate the real `manifest`/`registry`), so removing the injection returns the guardrail to GREEN against real data.
- **C5 (orphan inputs) is NOT required green here**: declaration sequencing (writes-before-inputs) and C5 satisfiability are 017's concern; this guardrail does not assert C5.

## Requirements *(mandatory)*

### Functional Requirements

**The bijection (US1)**

- **FR-001**: The system MUST add a CI test (the **drift guardrail**) asserting that the node set the dashboard **actually renders** is **bijective** with the union of manifest step ids + runtime-reachable `questionRegistry` ids. "Actually renders" means the spec-015 `StepGraph`→`FlowGraph`/`GraphNode` adapter output over `buildManifestStepGraph()` PLUS the `buildModularFlowGraph` drill-down nodes keyed by `questionRegistry`. The guardrail MUST fail CI if a rendered node has no runtime step, or a runtime-reachable step has no rendered node.
- **FR-002**: The guardrail MUST obtain "the node set the dashboard actually renders" in a way that reflects the real 015 render path (the adapter + drill-downs), not a re-derivation that could itself drift. **Per D2 (RESOLVED: D2a)**, this is done by re-running the EXACT builders `DashboardView` composes in-test (the 015 adapter over `buildManifestStepGraph()` ∪ `buildModularFlowGraph` over `FLOW_SOURCES`) and collecting node ids; the snapshot route (D2b) is rejected. **Precondition:** the rendered-set composition MUST be factored into ONE shared exported function consumed by BOTH `DashboardView` and the guardrail, so the guardrail cannot become a second, drifting composition — an upstream handoff to the 015 owner (see Clarifications, D2). Any such shared helper lives in `dashboard/`, imports only `steps/` + `survey/` leaves (no `stores/`/`editors/`), and is analyzed by depcruise.
- **FR-003**: The runtime-reach set MUST be the **union** of (a) manifest step ids reachable per `findUnreachable` (`completeness.ts:475-499`) and (b) `questionRegistry` ids reachable per `resolveNext` over `next` / `FlowGotoRule[]` (the `buildGraphFromQuestions` edge set, `buildStepGraph.ts:84-112`).

**The negative test (US2)**

- **FR-004**: The guardrail MUST include a **negative test**: a manifest step with **no registry/YAML coverage** MUST turn the guardrail RED.
- **FR-005**: The guardrail MUST include a **negative test**: an **orphan `questionRegistry` id** with no rendered node MUST turn the guardrail RED.
- **FR-006**: The negative-test divergence MUST be injected **locally** to the guardrail (a fixture/clone), MUST NOT mutate the real `manifest` or `questionRegistry`, and removing the injection MUST return the guardrail to GREEN against real data.

**Per-graph reachability (US3)**

- **FR-007**: Reachability for **manifest editor-steps** MUST be computed via `findUnreachable`'s spine-or-transitive-`joinTarget` rule (`completeness.ts:475-499`). Reachability for **survey questions** MUST be computed via `resolveNext` over `next` / `FlowGotoRule[]` (the `buildGraphFromQuestions` edge set, `buildStepGraph.ts:84-112`). The guardrail MUST run **both** computations (`findUnreachable` is blind to `FlowGotoRule` branching, so survey-question reachability cannot reuse it).
- **FR-008**: The guardrail MUST verify `pb_discovery_intro` (the discovery-method gate question that fronts the build-list branch) in the **question** graph (via `resolveNext`), confirming the boundary-crossing step is covered there and not in the manifest graph. **Ratified reconciliation (2026-06-29, km archivist):** the originally named `pb_build_list` is the `BuildListView` React branch (`survey/PhaseB.tsx:535`), NOT a `questionRegistry` id — no `pb_build_list` id exists in the codebase, so it cannot be asserted in the question graph. The reachable registry id at that boundary is `pb_discovery_intro` (`survey/questions/b/pb_discovery_intro.ts`, `registry.b.ts:74`), reached as a string-`next` target (`pb_co_installed_keyboards.ts:17`) behind the IntroChooser gate; it IS in `surveyReach`, NOT in `editorReach`, and IS rendered. This amends the originally locked id to match ground truth; the FR-008 *intent* (boundary-crossing step verified in the question graph) is unchanged.

**Distinctness, co-location, and Phase-1 invariants**

- **FR-009**: The guardrail MUST be **distinct from** the pre-existing tautological test at `buildStepGraph.test.ts:323-356` (the C8/C9 block) and MUST catch the §1 drift that test cannot. It MUST NOT reuse or re-assert the manifest ↔ `buildManifestStepGraph` identity that test already covers. **Per D1 (RESOLVED)**, the guardrail lives in **its own co-located file in the dashboard tree** (e.g. `dashboard/driftGuardrail.test.ts`, beside `completeness.test.ts`) and **imports `buildManifestStepGraph` directly** — confirmed safe against `pnpm depcruise` (test files are excluded from analysis per `.dependency-cruiser.cjs:123-126`, so the import does not re-introduce the `completeness.ts:526` cycle). A separate file (not an addition to `buildStepGraph.test.ts`) keeps the distinction from C8/C9 structural rather than reader-discipline.
- **FR-010**: The guardrail MUST be **co-located** with the existing manifest-shape guards (`validateManifestShape()` M2–M6, incl. M4b — `manifest.test.ts`) and the completeness checks C1–C7 (`dashboard/completeness.ts` / `completeness.test.ts`), in the established test tree. **Reading (ratified per D1):** `manifest.test.ts` is in `steps/` and `completeness.test.ts` in `dashboard/`, so "co-locate with the guard tree" is not a single folder; placing the guardrail in `dashboard/` (home of the bijection machinery `buildManifestStepGraph`, `buildModularFlowGraph`, `findUnreachable`) satisfies FR-010 as "the established guard tree."
- **FR-011**: This feature MUST introduce **no new write routing**, **no contracts bump**, and **no flag flip**; observable runtime/IR/render behavior MUST remain **byte-identical**. Per D2a, the only 016 artifact is the new test file; the shared rendered-set helper it consumes is a 015 deliverable (the D2a precondition), not a new 016 surface.

**Out of scope (explicit non-goals)**

- **FR-012**: This feature MUST NOT reuse or re-assert the tautological manifest ↔ `buildManifestStepGraph` test at `buildStepGraph.test.ts:323-356`; MUST NOT declare `inputs`/`writes` (spec 017) and MUST NOT require C5 to be green here (declaration sequencing is 017's concern); MUST NOT add the no-delete registry-membership assertion (that backs the demotion in spec 022); MUST NOT change the render path, write routing, or contracts, and MUST NOT flip any flag; and MUST NOT define the loop / Phase-2 cycle semantics.

### Key Entities *(include if feature involves data)*

> No `@keyboard-studio/contracts` change. All entities below are **existing** symbols reused as-is (no contracts bump).

- **Rendered node set**: The node ids the dashboard ACTUALLY renders post-015 — the `StepGraph`→`FlowGraph`/`GraphNode` adapter output over `buildManifestStepGraph()` (`buildStepGraph.ts:237`) PLUS the `buildModularFlowGraph` drill-down nodes keyed by `questionRegistry` (`survey/questions/registry.ts`). Surfaced via the 015 render path (`DashboardView.tsx`, `FlowGraphView.tsx`, `layout.ts`).
- **Manifest step ids**: `manifest` (`steps/manifest.ts`); one entry per inter-phase step; the opaque `charactersStep` placeholder (`manifest.ts:47-56`) subsumes the Phase A/B survey questions.
- **`questionRegistry` ids**: `questionRegistry` (`survey/questions/registry.ts:25`); the registered survey-question modules across the `a` / `b` / `f` sub-registries (`registry.a.ts` / `registry.b.ts` / `registry.f.ts`).
- **`findUnreachable`**: `completeness.ts:475-499` — spine-or-transitive-`joinTarget` reachability over `manifest`; the editor-step reachability rule. Blind to `FlowGotoRule` branching.
- **`resolveNext`**: `survey/SurveyRunner.tsx` (exported; exercised in `SurveyRunner.test.ts`) — resolves `next` / `FlowGotoRule[]` per question; the survey-question reachability rule. Edge set defined by `buildGraphFromQuestions` (`buildStepGraph.ts:84-112`).
- **Tautological C8/C9 test**: `buildStepGraph.test.ts:323-356` — the pre-existing manifest ↔ `buildManifestStepGraph` identity assertion; the thing this guardrail is explicitly NOT and must out-cover.
- **`buildManifestStepGraph`**: `buildStepGraph.ts:237` — emits one `StepGraphNode` per manifest entry; the 015 adapter's input. (Import-boundary subtlety: `completeness.ts:526` avoids importing it; a test file does not sit on that cycle — D1.)
- **`pb_discovery_intro`** (ratified stand-in for the originally named `pb_build_list`): the discovery-method gate question (`survey/questions/b/pb_discovery_intro.ts`, `registry.b.ts:74`) reached as a string-`next` target (`pb_co_installed_keyboards.ts:17`) behind the IntroChooser gate (`survey/PhaseB.tsx:758`); a registry-keyed drill-down under the opaque `characters` node; the boundary-crossing step checked in the question graph. NOTE: `pb_build_list` itself is the `BuildListView` React branch (`survey/PhaseB.tsx:535`, used ~`692`) selected by the gate's "build-list" choice — it is NOT a `questionRegistry` id and so cannot be asserted in the question graph; `pb_discovery_intro` is the reachable registry id at that boundary (see FR-008 ratification).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The guardrail asserts the rendered node set (015 adapter output + `questionRegistry` drill-downs) **equals** the union of manifest step ids + runtime-reachable `questionRegistry` ids, and passes on unmodified `main`.
- **SC-002**: A manifest step lacking registry/YAML coverage causes the guardrail to **FAIL** (negative test RED) — demonstrated against a guardrail-local injection.
- **SC-003**: An orphan `questionRegistry` id with no rendered node causes the guardrail to **FAIL** (negative test RED) — demonstrated against a guardrail-local injection.
- **SC-004**: Editor-step reachability uses `findUnreachable`; survey-question reachability uses `resolveNext` over `next` / `FlowGotoRule[]`; **both** run and contribute to the runtime-reach union.
- **SC-005**: `pb_discovery_intro` (the discovery-method gate fronting the build-list branch; ratified stand-in for the originally named `pb_build_list`, which is a React component branch not a registry id — see FR-008) is verified in the **question** graph (via `resolveNext`), confirming the boundary-crossing step is covered.
- **SC-006**: The guardrail is **distinct from** `buildStepGraph.test.ts:323-356` and would catch the §1 drift that test cannot — demonstrated by the negative test going RED where the tautological test stays green.
- **SC-007**: `pnpm test` / CI is **GREEN on `main`** and goes **RED on each injected divergence** (uncovered manifest step; orphan registry id). `pnpm typecheck` and `pnpm depcruise` stay green (the test introduces no new forbidden dependency boundary).
- **SC-008**: No contracts change, no flag flip, no write-routing change; flag-off / runtime / render output remains **byte-identical** to pre-016 (the only diff is the added test, plus any test-only helper from D2).

## Assumptions

- **Spec 015 is landed and stable.** The `StepGraph`→`FlowGraph`/`GraphNode` adapter, the wired `DashboardView` projection, and the `buildModularFlowGraph` registry-keyed drill-downs exist; the guardrail asserts against the node set the dashboard renders post-015. (Dependency; the rendered graph must exist first.)
- **The manifest + `questionRegistry` are the single source of truth.** The map projects manifest + `questionRegistry`; so does the runtime. The guardrail's job is to make "adding a question appears on the map" enforced, not a maintenance chore (§4).
- **`findUnreachable` and `resolveNext` exist and are reused as-is.** `findUnreachable` (`completeness.ts:475-499`) and `resolveNext` (`survey/SurveyRunner.tsx`, exported) are existing, tested symbols; the guardrail composes them, it does not re-implement reachability.
- **A test file is not on the `completeness.ts` circular-dependency cycle.** `completeness.ts:526` avoids importing `buildManifestStepGraph` because of `completeness.ts → buildStepGraph.ts → manifest.ts → registerEditorSteps → editors/ → stores/ → completeness.ts`. A test file does not sit on that cycle, so it MAY import `buildManifestStepGraph` directly — to be confirmed against `pnpm depcruise` during planning (D1).
- **Reserve/library modules are out of scope.** A registered-but-unreachable `questionRegistry` id (off the active branch) is rendered by `computeReserveNodes` (`buildStepGraph.ts:150-182`), a separate mechanism; the bijection is asserted over the **reachable** set only. The no-delete registry-membership assertion belongs to spec 022, not here.
- **C5 is not asserted here.** Declaration sequencing (writes-before-inputs) and C5 satisfiability are 017's concern; this guardrail neither declares `inputs`/`writes` nor requires C5 green.
- **Phase-1 invariants hold.** No new write routing, no contracts bump, no flag flip, behavior byte-identical, every in-scope step appears as a map node (read-only / test-only as applicable).

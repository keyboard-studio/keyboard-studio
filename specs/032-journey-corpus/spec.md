# Feature Specification: Journey corpus — replayable end-to-end user-workflow fixtures with manifest edge-coverage gates

**Feature Branch**: `km/journey-corpus`

**Created**: 2026-07-06

**Status**: Draft

**Input**: Make realistic user workflows (including backtracking) into tracked, executable test artifacts; surface unsupported routing gaps as fixture diffs. The survey routing engine is already pure and heavily unit-tested (evalCondition, resolveNext, advanceThrough in packages/studio/src/survey/SurveyRunner.tsx); the journeys are end-to-end replays of that engine, coupled with a manifest edge-coverage gate that reports which survey steps and branch edges are exercised by zero journeys.

**Governing scope**: This feature implements the journey-corpus harness as described above and cites [docs/workflow-model.md](../../docs/workflow-model.md) (working-copy spine), [specs/012-step-model-manifest/spec.md](../012-step-model-manifest/spec.md) (step manifest architecture), and [spec.md §8 Data Flow](../../spec.md) (the routing loop). It does not re-derive that scope. Gallery decomposition (carve, mechanisms, touch loops) remains deferred pending spec #9 (loop primitive).

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Fixture-driven headless replay of survey routing (Priority: P1)

A test engineer authors a journey fixture (a structured YAML trace of survey answers + persona metadata) and runs it headless through the routing engine via vitest. The fixture replays a real user workflow — e.g., "Bafut speaker, qwerty layout, Track 1 copy/adapt" — and asserts expected outcomes (final routing group, strategy selection, key IR state).

**Why this priority**: The journey fixtures are the core deliverable. They make user workflows into executable, version-controlled artifacts that developers can read and extend. Headless replay (no DOM, no Playwright) is fast, deterministic, and suitable for CI.

**Independent Test**: Load a fixture → walk flows via pure routing functions → assert outcomes. A single fixture should be testable in isolation and deliver value (regression detection on that workflow).

**Acceptance Scenarios**:

1. **Given** a journey fixture with a persona (language, script, routing group) and ordered answers, **When** the replay harness loads it, **Then** it walks the modular flows via evalCondition/resolveNext/advanceThrough, records store actions (recordPhase/recordAssignments), and produces a final working-copy IR.
2. **Given** the final IR, **When** assertions are checked, **Then** routing_group, strategy selection, and key output properties match the fixture's expected_outcomes.
3. **Given** a backtrack event (revisit an earlier step, change an answer), **When** the harness replays it, **Then** staleness closures and re-routing are applied correctly.

---

### User Story 2 - Manifest edge-coverage gate reports unsupported gaps (Priority: P2)

A harness runs all journey fixtures, aggregates which manifest steps and branch edges are exercised, and produces a coverage report. Edges or steps exercised by zero journeys are surfaced as gaps. The gate can block CI (hard fail) or report first with a ratchet (soft warn with escalation path).

**Why this priority**: Coverage gates prevent silent drift — if a survey routing branch has no fixture, it becomes a known blind spot in test coverage. A P2 because the harness itself (US1) is the gating deliverable; the coverage gate is the structural guard that keeps the fixtures honest.

**Independent Test**: Run all fixtures → aggregate renderedNodeSet/step-graph reachability → assert every manifest step or branch edge is exercised by at least one journey. A report mode (list uncovered edges) is independently valuable even before a hard gate is decided.

**Acceptance Scenarios**:

1. **Given** all journey fixtures, **When** the coverage harness runs, **Then** it aggregates which StepGraph steps and edges render for each journey's answer set and computes the union.
2. **Given** the union, **When** it is compared to the full manifest, **Then** any step or edge with zero-journey coverage is listed in a coverage report.
3. **Given** the coverage report, **When** a new fixture closes a gap, **Then** the report's list shrinks (closure is observable).

---

### User Story 3 - Persona metadata makes fixtures readable and searchable (Priority: P2)

Each fixture carries persona metadata (language, script code, routing group, source keyboard if real). Developers can read a fixture and immediately know "this is a Cree speaker, Track 2 import from bj_cree_woods" without parsing the answers.

**Why this priority**: Metadata makes the fixture corpus self-documenting. A developer extending the survey can scan fixtures by language/routing group and understand which workflows are already tested.

**Independent Test**: Load a fixture → inspect persona fields → confirm metadata matches the fixture's flow paths and answer set. Metadata should be human-readable and machine-queryable (e.g., group fixtures by `routing_group`).

**Acceptance Scenarios**:

1. **Given** a fixture, **When** its persona block is read, **Then** it contains language, script, routing_group, and optionally source_keyboard (real keyboard id if Track 2 import).
2. **Given** the persona fields, **When** they are matched against the fixture's flow path, **Then** routing_group and strategy selection match the expected outputs.
3. **Given** multiple fixtures, **When** grouped by routing_group, **Then** fixtures are indexable by language/script profile.

---

### Edge Cases

- **No answer for a conditional question**: the journey halts with a routing error (expected_error asserted).
- **A manifest step marked as `joinTarget` but never forked to**: the union still includes it; it appears in coverage as exercised (because the spine reaches it).
- **Backtrack to an earlier step, change an answer, and the new branch is unreachable**: the harness halts with a routing error or applies staleness rules (depends on validator decision).
- **A journey that adds nothing beyond base prefill (minimal-defaults)**: valid; the fixture records confirmations with empty additions, and branch-skipped questions are simply absent from the events array (matching the completed-instance convention).
- **Fixture authored manually (hypothetical scenario like Bafut) vs. derived from a real keyboard scan**: both are supported; metadata distinguishes them.

---

## Requirements *(mandatory)*

### Functional Requirements

**Journey fixture schema and directory**

- **FR-001**: A `content/journeys/` directory MUST exist to hold journey fixture YAML files. Each fixture MUST follow the journey schema: `journey_id` (unique fixture identifier — deliberately NOT `flow_id`, which in the completed-instance format names a single flow template; a journey spans the whole manifest spine), `persona` (metadata: language, script, routing_group, optional source_keyboard), `events` (ordered array of {stepId, answers | editor-action summary}), `expected_outcomes` (routing_group, strategy, key IR assertions), and optional `backtrack_events` (revisits with new answers and staleness expectations).
- **FR-002**: The journey schema MUST support two event types: (a) survey-answer events ({stepId, questionId, value}), and (b) editor-action summaries ({stepId, action_type: "gallery_edit" | "mechanism_edit" | "touch_edit", summary: "key K1 composed N1"}) for steps that loop over per-key gallery operations. The harness applies store actions (recordPhase/recordAssignments) for (a) and records action summaries (no individual key-loop decomposition) for (b).

**Headless replay harness (vitest)**

- **FR-003**: A headless replay harness MUST exist in `packages/studio` (location TBD: `src/survey/journey-runner.ts` or `src/test/journey-harness.ts`) that exports a pure function `replayJourney(fixture: JourneyFixture): Promise<ReplayResult>`. The function MUST: (a) load the modular flows via loadModularFlow, (b) walk them via pure routing functions (evalCondition, resolveNext, advanceThrough), (c) apply store actions to a working-copy spine, (d) assert expected_outcomes, and (e) report which steps/edges were exercised.
- **FR-004**: The harness MUST be store-free during replay — it instantiates a fresh working copy for each fixture, applies actions to it, and discards it after assertions. No mutation of global state, no UI render, no Playwright.
- **FR-005**: The harness MUST handle backtrack events: revisit an earlier stepId, apply new answers, re-route from that point, and assert staleness closures and IR reconciliation (per spec.md §11 working-copy spine rules).

**Manifest edge-coverage gate**

- **FR-006**: A `coverage-report` function MUST aggregate all journey fixtures, compute the union of exercised steps/edges via renderedNodeSet (packages/studio/src/dashboard/renderedNodeSet.ts) and buildStepGraph (packages/studio/src/dashboard/buildStepGraph.ts), and compare it to the full manifest StepGraph. Steps or edges with zero-journey coverage MUST be listed in a coverage report.
- **FR-007**: The gate MUST be configurable as (a) report-only (list uncovered edges, exit 0), or (b) ratchet (list uncovered edges, fail if new gaps appear since last baseline, exit non-zero 1 if regressions). The choice (hard fail vs. ratchet) is deferred to implementation; this spec names both modes as valid approaches.
- **FR-008**: The coverage report MUST be human-readable and machine-queryable (JSON or YAML output): list of {stepId, edgeType (spine | fork | join), covered_by: [journey fixture ids]} for each manifest element.

**First fixtures (deliverables)**

- **FR-009**: Four initial journey fixtures MUST be authored: (a) **bafut-end-to-end** — the Bafut hypothetical language journey assembled from the existing phase_a_bafut.yaml, phase_b_bafut.yaml, phase_f_bafut.yaml examples (content/flows/_examples/), spanning the full manifest spine from identity through package. (b) **bj-cree-woods-track2** — a Track-2 adapt journey using the real bj_cree_woods keyboard (docs/keyboard-index.md row 41), mirroring the walk in packages/studio/e2e/carve.spec.ts; persona: source_keyboard="bj_cree_woods", routing_group=inferred, strategy=inferred. (c) **backtrack-journey** — one backtrack scenario: e.g., start with a qwerty `layout_family` answer, advance several Phase A questions, then revisit `layout_family` and change it to azerty (a real option that flips `routing_group`), asserting the re-route and the staleness closure over downstream steps. (d) **minimal-defaults** — the shortest supported spine pass: the author accepts every base-derived prefill confirmation and adds nothing (the §3c "defaults are the product" path); asserts the spine remains shippable with zero custom answers.
- **FR-010**: Each fixture MUST include assertions on `expected_outcomes`: at minimum routing_group and strategy selection; optionally key IR state (e.g., character set size, number of rules emitted). The assertions MUST be verifiable by the harness without user interaction.

**Test wiring**

- **FR-011**: A vitest suite `packages/studio/src/survey/journey-runner.test.ts` (or equivalent) MUST exist and import all fixtures, run replayJourney() on each, assert outcomes, and collect coverage data. The suite MUST be runnable via `pnpm --filter @keyboard-studio/studio test` and included in `pnpm test`.
- **FR-012**: The coverage-report function MUST be runnable standalone (e.g., `tsx scripts/coverage-report.ts` or `pnpm run coverage:report`) and generate a report file (location TBD: `docs/journey-coverage.json` or `.test/coverage/journey-coverage.json`).

**Non-goals (explicit out of scope)**

- **FR-013**: Pilot-user telemetry or `__ksE2E__` event-trace export is NOT in scope. The event-trace hook (packages/studio/src/lib/e2eHook.ts) is not extended by this feature. Event tracing is a follow-up deliverable.
- **FR-014**: Reverse-engineering the 438 clean keyboards from import-corpus.json into journey fixtures is NOT in scope. The four initial fixtures are hand-authored. A bulk-scan follow-up is separate.
- **FR-015**: Gallery decomposition (per-key loops in carve, mechanisms, touch) is NOT in scope. Gallery steps record action summaries only; the loop primitive (spec #9) is deferred. Gallery write mechanisms are unchanged.
- **FR-016**: No new `mutate()` write path, no contracts bump, no KeyboardIR schema change. The harness is read-only and replay-only.

---

## Key Entities *(include if feature involves data)*

- **Journey Fixture (YAML schema)**: {journey_id, persona {language, script, routing_group, source_keyboard?}, events [{stepId, answers | editor-action}], expected_outcomes {routing_group, strategy, ...}, backtrack_events?}. Stored in `content/journeys/`.
- **JourneyFixture (TS interface)**: mirrors the YAML schema, defined in packages/studio (location TBD) and used by replayJourney().
- **ReplayResult**: {stepId, exercisedEdges: StepGraphEdge[], finalIR: KeyboardIR, assertions_passed: boolean, errors?: string[]}. Returned by replayJourney().
- **SurveyRunner pure functions** (packages/studio/src/survey/SurveyRunner.tsx): evalCondition, resolveNext, advanceThrough. Already exist and are heavily unit-tested; the harness calls these without modification.
- **Store actions** (packages/studio/src/stores/workingCopyStore.ts): recordPhase, recordAssignments. The harness invokes these to mutate the working copy during replay.
- **Coverage report**: {stepId, edgeType, covered_by: string[]} array, queryable by stepId or routing_group. Human-readable summary also included.
- **buildStepGraph / StepGraph** (packages/studio/src/dashboard/buildStepGraph.ts): computes the full manifest spine graph. The coverage gate reads this to determine what MUST be exercised.
- **renderedNodeSet** (packages/studio/src/dashboard/renderedNodeSet.ts): computes which steps render for a given answer set. The harness calls this per-fixture to determine coverage.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The four initial journey fixtures (bafut-end-to-end, bj-cree-woods-track2, backtrack-journey, minimal-defaults) MUST author successfully and pass the replay harness with expected_outcomes assertions green.
- **SC-002**: The coverage report MUST be generated and list which manifest steps/edges are exercised by each fixture. At least 80% of the manifest spine MUST be exercised by the four initial fixtures (the 20% gap is acceptable for deferred gallery decomposition and spec #9 primitives).
- **SC-003**: A backtrack event in one fixture MUST correctly apply staleness rules, re-route from the revised step, and assert the new branch is valid or fails with a diagnostic error.
- **SC-004**: `pnpm --filter @keyboard-studio/studio test` MUST include and pass the journey-runner.test.ts suite. No regressions in existing SurveyRunner unit tests.
- **SC-005**: The coverage-report command MUST run standalone, emit a report file, and be runnable in CI (e.g., as part of `pnpm test` or a separate gate).
- **SC-006**: Every fixture MUST include persona metadata (language, script, routing_group) that is human-readable and queryable. Developers MUST be able to grep fixtures by routing_group and find relevant workflows.

---

## Assumptions

- **SurveyRunner pure functions are correct and read-only** (packages/studio/src/survey/SurveyRunner.tsx:evalCondition, resolveNext, advanceThrough). This feature reuses them without modification.
- **The modular flow loader (loadModularFlow, packages/studio/src/survey/loadModularFlow.ts) is correct and will be called by the harness.** Flows themselves are not authored by this feature; existing phase_*.modular.yaml flows are reused.
- **The working-copy spine (spec.md §8 + docs/workflow-model.md) is the authoritative mutation model.** The harness applies store actions and asserts IR state against the spine rules, not against a different reference model.
- **bj_cree_woods is a valid reference keyboard** (docs/keyboard-index.md, row 41); its phonebook entry is current and will remain so.
- **The manifest is stable** (specs/012-step-model-manifest/spec.md defines the editor-step list). If new manifest steps are added post-032, the coverage gate MUST be updated to include them; the gate cannot go backward (fewer covered steps).
- **No contracts bump and no loop primitive.** The feature does not introduce new KeyboardIR fields or loop constructs. Gallery action summaries are metadata, not structural IR changes.
- **Coverage gate decision (hard fail vs. ratchet) is deferred to implementation planning.** Both modes are valid; the spec names both; planning will choose.

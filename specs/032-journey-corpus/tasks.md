---

description: "Task list for Journey corpus — replayable end-to-end user-workflow fixtures with manifest edge-coverage gates"
---

# Tasks: Journey corpus — replayable end-to-end user-workflow fixtures with manifest edge-coverage gates

**Input**: Design documents from `specs/032-journey-corpus/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/journey-fixture-schema.md](contracts/journey-fixture-schema.md)

**Tests**: INCLUDED — this feature IS a test harness; its own correctness is proven by the four fixtures passing plus unit tests on the harness functions.

**Organization**: Tasks are grouped by user story per spec.md (US1–US3). Note the real cross-story dependency: US2's coverage gate depends on US1's harness existing and being able to report exercised nodes.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [ ] T001 Create feature branch `km/journey-corpus` off `main`
- [ ] T002 [P] Confirm the corrected routing-engine scope from research R1 by reading `packages/studio/src/steps/advance.ts` (`advance()`, `nextSpineStepAfter()`, `manifestIndexOf()`) and `packages/studio/src/steps/reducer.ts`'s `applyStepCompletion()` in full — these are the harness's real cross-manifest-step dependency, not just `SurveyRunner.tsx`

---

## Phase 2: Foundational — fixture schema + types (BLOCKS every user story)

**Purpose**: Nothing can be authored or replayed until the fixture shape exists.

- [ ] T003 [P] Create `packages/studio/src/survey/journeyFixture.ts` — `JourneyFixture`, `JourneyPersona`, `JourneyEvent`, `JourneyBacktrackEvent` TS interfaces (per data-model.md), plus a YAML parser/validator (fail loudly on a malformed fixture, mirroring `loadModularFlow.ts`'s `parseThinYaml` error-message style)
- [ ] T004 [P] Add `ReplayResult` interface to `packages/studio/src/survey/journeyFixture.ts` (or a colocated types file): `{ journeyId, exercisedStepIds, exercisedEdges, finalIR, assertionsPassed, errors? }`

**Checkpoint**: `pnpm --filter @keyboard-studio/studio typecheck` passes with the new types; no runtime code yet.

---

## Phase 3: User Story 1 - Fixture-driven headless replay of survey routing (Priority: P1) 🎯 MVP

**Goal**: `replayJourney(fixture)` walks a fixture through both routing layers and asserts `expected_outcomes`.

**Independent Test**: Load a fixture → walk via the two routing layers → assert outcomes, in isolation, no DOM/Playwright.

### Tests for User Story 1

- [ ] T005 [US1] Write `packages/studio/src/survey/journey-runner.test.ts`'s skeleton with the four fixture imports (initially failing/pending — fixtures don't exist yet) so the suite structure exists before the harness and fixtures land

### Implementation for User Story 1

- [ ] T006 [US1] Implement `replayJourney(fixture: JourneyFixture): Promise<ReplayResult>` in `packages/studio/src/survey/journey-runner.ts` — instantiates a fresh working copy (FR-004, no global-store mutation), drives cross-manifest-step transitions via `steps/advance.ts`/`reducer.ts`, drives intra-step question routing via `SurveyRunner.tsx`'s `evalCondition`/`resolveNext`/`advanceThrough`, applies `recordPhase`/`recordAssignments` for survey-answer events, and records action summaries verbatim for `gallery_edit`/`mechanism_edit`/`touch_edit` events (FR-002/FR-015 — no per-key decomposition)
- [ ] T007 [US1] Implement backtrack handling in `replayJourney`: revisit the named `stepId`, apply the new answer, re-route from that point, and assert the reducer's existing staleness machinery (`getStaleSteps`/`repropagate`) fires correctly (FR-005)
- [ ] T008 [P] [US1] Author `content/journeys/bafut-end-to-end.yaml` — assembled from `content/flows/_examples/phase_{a,b,f}_bafut.yaml`, full spine identity→package (FR-009a)
- [ ] T009 [P] [US1] Author `content/journeys/bj-cree-woods-track2.yaml` — Track 2 adapt using the real `bj_cree_woods` keyboard, mirroring the walk in `packages/studio/e2e/carve.spec.ts` (FR-009b)
- [ ] T010 [P] [US1] Author `content/journeys/minimal-defaults.yaml` — accept every base-derived prefill, zero custom answers, asserts the spine stays shippable (FR-009d)
- [ ] T011 [US1] Author `content/journeys/backtrack-journey.yaml` — qwerty `layout_family` answer, advance several Phase A questions, revisit and flip to azerty, asserting re-route + staleness closure over downstream steps (FR-009c) — depends on T007's backtrack handling existing
- [ ] T012 [US1] Fill in `journey-runner.test.ts`: run `replayJourney` on all four fixtures, assert each `expected_outcomes` (SC-001)

**Checkpoint**: All four fixtures pass; US1 is independently demoable (regression detection on real workflows).

---

## Phase 4: User Story 2 - Manifest edge-coverage gate reports unsupported gaps (Priority: P2)

**Goal**: A coverage report shows which manifest steps/edges zero fixtures exercise.

**Independent Test**: Run all fixtures → aggregate rendered nodes → compare against the full manifest → list zero-coverage entries.

**Depends on**: US1 (needs `replayJourney`'s exercised-node tracking, T006).

### Implementation for User Story 2

- [ ] T013 [US2] Implement `packages/studio/src/dashboard/journeyCoverage.ts`'s `computeCoverageReport(fixtures)`: per fixture, compute rendered nodes via `buildFlowSources()` + `collectRenderedNodeIds()` (research R2's corrected function names), union across fixtures, compare against `buildManifestStepGraph()`'s full edge/step set (FR-006)
- [ ] T014 [US2] Report-only mode (research R6): the report always exits 0, listing `{stepId, edgeType, covered_by}` per manifest element, uncovered entries have `covered_by: []` (FR-007/FR-008) — defer the ratchet/hard-fail mode to a follow-up
- [ ] T015 [US2] Create the standalone CLI entry point (`scripts/coverage-report.ts` or a `package.json` script, per plan.md's own "location TBD, resolved here") runnable via `tsx`, emitting the report to `docs/journey-coverage.json` (FR-012)
- [ ] T016 [US2] Confirm SC-002's 80% manifest-spine coverage threshold is met by the four fixtures; if short, note the specific gap in the report rather than padding fixtures artificially

**Checkpoint**: Coverage report generates; the four fixtures' real coverage is visible and honest (including any gap below 80%, logged not hidden).

---

## Phase 5: User Story 3 - Persona metadata makes fixtures readable and searchable (Priority: P2)

**Goal**: Every fixture's persona block is accurate and groupable by `routing_group`.

**Independent Test**: Load a fixture, inspect persona fields, confirm they match the fixture's actual flow path and outcomes.

### Implementation for User Story 3

- [ ] T017 [P] [US3] Verify all four fixtures' `persona` blocks (language, script, routing_group, source_keyboard where applicable) match their actual replayed outcomes — cross-check against T012's assertions rather than hand-waving the metadata
- [ ] T018 [US3] Confirm fixtures are groupable/queryable by `routing_group` — a simple `grep`/`yq` walkthrough documented in a comment or the coverage report, per SC-006 ("developers MUST be able to grep fixtures by routing_group")

**Checkpoint**: SC-006 — persona metadata is human-readable and machine-queryable.

---

## Phase 6: Polish & Cross-Cutting Validation

- [ ] T019 [P] Run the full repeatable gate: `pnpm --filter @keyboard-studio/studio typecheck`, `pnpm --filter @keyboard-studio/studio test` (SC-004 — no regression in existing `SurveyRunner` unit tests), `pnpm lint`
- [ ] T020 [P] Confirm FR-013 (no `__ksE2E__` telemetry export) and FR-014 (no bulk-scan of the 438-keyboard import corpus) were not accidentally pulled in during implementation
- [ ] T021 Update `docs/tooling.md` or a survey-testing doc with the new `pnpm run coverage:report`-style command and where `content/journeys/` fixtures live

---

## Dependencies & Execution Order

- **Setup (Phase 1)**: no deps.
- **Foundational (Phase 2)**: after Setup. Blocks every user story.
- **US1 (Phase 3, P1)**: after Foundational. The harness (T006/T007) must exist before the `backtrack-journey` fixture (T011) can be authored against it; the other three fixtures (T008–T010) are parallel and independent of the harness's backtrack logic specifically.
- **US2 (Phase 4, P2)**: after US1's `replayJourney` exists and tracks exercised nodes (T006).
- **US3 (Phase 5, P2)**: after US1's fixtures are authored and passing (T012) — persona verification needs real replayed outcomes to check against.
- **Polish (Phase 6)**: after the desired stories complete.

## Parallel Opportunities

- T008/T009/T010 (three of the four fixtures) are `[P]` — different files, no interdeps on each other.
- T017 `[P]` with the Polish-phase tasks once US1/US2 are done.

## Notes

- `[P]` = different files, no incomplete-task dependency.
- No `Pattern`/`KeyboardIR`/contract change (FR-016) — the harness is read-only/replay-only.
- FR-015's gallery action-summary recording (no per-key loop decomposition) is a hard non-goal — do not build gallery replay logic even if a fixture author is tempted to.

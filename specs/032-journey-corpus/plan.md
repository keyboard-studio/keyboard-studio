# Implementation Plan: Journey corpus — replayable end-to-end user-workflow fixtures

**Branch**: `km/journey-corpus` (original) | **Date**: 2026-08-19 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/032-journey-corpus/spec.md`

## Summary

Build a headless (vitest, no DOM/Playwright) replay harness for YAML-authored "journey" fixtures — full survey walks including backtracking — plus a manifest edge-coverage gate reporting which steps/branches are exercised by zero fixtures. The spec's cited low-level routing primitives (`evalCondition`/`resolveNext`/`advanceThrough` in `SurveyRunner.tsx`, `recordPhase`/`recordAssignments` on `workingCopyStore`) are unchanged since authoring; research found one real gap the spec's pre-migration text doesn't anticipate — cross-manifest-step transitions now route through `steps/advance.ts`/`reducer.ts`, which the harness must also drive for a true end-to-end (identity→package) replay.

## Technical Context

**Language/Version**: TypeScript 5.x (strict), vitest.

**Primary Dependencies**: `packages/studio/src/survey/SurveyRunner.tsx` (intra-step routing primitives), `packages/studio/src/steps/{advance.ts,reducer.ts}` (manifest-level transitions, per research R1), `packages/studio/src/dashboard/buildStepGraph.ts`'s `buildManifestStepGraph()` (coverage baseline) and `renderedNodeSet.ts`'s `buildFlowSources()`/`collectRenderedNodeIds()` (per-fixture rendered-node computation, per research R2/R3), `packages/studio/src/survey/loadModularFlow.ts`. No new external dependencies.

**Storage**: `content/journeys/*.yaml` — new, hand-authored fixture files (human-authored test data, same convention as `content/flows/`).

**Testing**: This feature IS a testing harness — its own correctness is proven by the four initial fixtures passing (SC-001) plus unit tests on the harness functions themselves (fixture parsing, coverage aggregation).

**Target Platform**: Node (vitest, CI).

**Project Type**: New test-infrastructure module within `packages/studio`.

**Performance Goals**: Headless replay must stay fast enough for routine `pnpm test` inclusion (SC-004) — no network, no DOM, no Playwright browser launch.

**Constraints**: Store-free during replay (FR-004) — fresh working copy per fixture, discarded after assertions, no global-state mutation. No gallery per-key loop decomposition (FR-015 — action summaries only). No contracts/KeyboardIR schema change (FR-016).

**Scale/Scope**: 1 new content directory (`content/journeys/`), 1 new harness module (~FR-003's `replayJourney`), 1 new coverage-report module (FR-006), 4 hand-authored fixtures (FR-009), 1 new vitest suite (FR-011), 1 new standalone report command (FR-012).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Article | Verdict | Notes |
|---|---|---|
| I. Pattern schema locked | **PASS (non-interference)** | No `Pattern`/`Criterion` field touched. |
| II. KeyboardIR is the engine spine | **PASS** | Read-only replay (FR-016) — the harness applies existing store actions to produce a `finalIR` for assertion, introducing no new mutation path. |
| III. Single working copy | **PASS** | Per-fixture, a single fresh working copy is instantiated and discarded (FR-004) — consistent with, not a second, working-copy model. |
| IV. Validator layering / one 300ms debounce | **PASS (non-interference)** | Not touched — replay is a headless test harness, not the authoring UI's debounce cycle. |
| V. VirtualFS only during authoring | **PASS** | Fixtures are test data, read at test time; no host-disk writes during replay. |
| VI. Team boundaries | **PASS** | Engine-owned (test infrastructure over the survey/dashboard internals). |
| VII. Out of scope for v1 | **PASS** | FR-015 explicitly defers gallery per-key loop decomposition (spec §9 loop primitive), consistent with the constitution's own deferred items. |
| VIII. House conventions | **PASS** | No emoji; commit will follow `<prefix>(<area>)`. |

**No violations. Complexity Tracking not required.**

## Project Structure

### Documentation (this feature)

```text
specs/032-journey-corpus/
├── plan.md              # This file
├── research.md          # Phase 0 output
└── data-model.md        # Phase 1 output (the JourneyFixture/ReplayResult shapes)
```

### Source Code (repository root)

```text
content/journeys/
├── bafut-end-to-end.yaml          # FR-009(a) — full spine, from content/flows/_examples/phase_{a,b,f}_bafut.yaml
├── bj-cree-woods-track2.yaml       # FR-009(b) — Track 2 adapt, real keyboard bj_cree_woods
├── backtrack-journey.yaml          # FR-009(c) — layout_family qwerty→azerty revisit, asserts re-route + staleness
└── minimal-defaults.yaml           # FR-009(d) — accept every base-derived prefill, zero custom answers

packages/studio/src/survey/
├── journey-runner.ts                # NEW: replayJourney(fixture): Promise<ReplayResult> — drives
│                                     #   SurveyRunner's evalCondition/resolveNext/advanceThrough for
│                                     #   within-flow routing AND steps/advance.ts's advance() +
│                                     #   reducer.ts's applyStepCompletion() for cross-manifest-step
│                                     #   transitions (research R1's corrected scope)
├── journeyFixture.ts                # NEW: JourneyFixture TS interface + YAML parser/validator
└── journey-runner.test.ts           # NEW (FR-011): imports all four fixtures, runs replayJourney,
                                      #   asserts expected_outcomes, collects coverage

packages/studio/src/dashboard/
└── journeyCoverage.ts                # NEW (FR-006): aggregates collectRenderedNodeIds(buildFlowSources())
                                       #   per fixture, compares against buildManifestStepGraph() (research
                                       #   R2/R3), report-only mode for this landing (research R5/R6)

scripts/ (or a package.json script)
└── coverage-report.ts (or similar)   # NEW (FR-012): standalone CLI entry point for journeyCoverage,
                                       #   emitting docs/journey-coverage.json (location per FR-012's own TBD, resolved here)
```

**Structure Decision**: Confined to `packages/studio/src/{survey,dashboard}` plus a new `content/journeys/` fixture directory and one new standalone script entry point. No cross-package edits; no contracts/engine changes (FR-016).

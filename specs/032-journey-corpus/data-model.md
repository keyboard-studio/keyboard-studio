# Phase 1 Data Model: Journey corpus

## Entity: `JourneyFixture` (NEW — YAML schema + TS interface)

**Files**: `content/journeys/*.yaml` (data), `packages/studio/src/survey/journeyFixture.ts` (TS interface + parser)

```ts
interface JourneyFixture {
  journey_id: string;                    // unique, e.g. "bafut-end-to-end"
  persona: {
    language: string;
    script: string;
    routing_group?: string;              // may be inferred, not always author-declared
    source_keyboard?: string;            // real keyboard id, Track 2 fixtures only
  };
  events: JourneyEvent[];                 // ordered
  expected_outcomes: {
    routing_group?: string;
    strategy?: string;
    // optional key-IR assertions, e.g. characterSetSize, ruleCount
    [key: string]: unknown;
  };
  backtrack_events?: BacktrackEvent[];
}

type JourneyEvent =
  | { stepId: string; questionId: string; value: string | string[] }          // survey-answer event (FR-002a)
  | { stepId: string; action_type: "gallery_edit" | "mechanism_edit" | "touch_edit"; summary: string }; // editor-action summary (FR-002b)

interface BacktrackEvent {
  revisit_step: string;
  new_answer: { questionId: string; value: string | string[] };
  expected_staleness?: string[];   // step ids expected to go stale and re-derive
}
```

## Entity: `ReplayResult` (NEW)

**File**: `packages/studio/src/survey/journey-runner.ts`

```ts
interface ReplayResult {
  journeyId: string;
  exercisedSteps: string[];        // manifest step ids visited
  exercisedEdges: string[];        // step-graph edges traversed (spine + fork)
  finalIR: KeyboardIR;
  assertionsPass: boolean;
  errors?: string[];
}
```

Produced by `replayJourney(fixture: JourneyFixture): Promise<ReplayResult>`, which per research R1:
1. Instantiates a fresh working copy (no global-store mutation, FR-004).
2. For each event: if it targets a step already active within the current flow, routes via `SurveyRunner.tsx`'s `evalCondition`/`resolveNext`/`advanceThrough`; if it crosses a manifest step boundary, drives `steps/reducer.ts`'s `applyStepCompletion()` and `steps/advance.ts`'s `advance()`.
3. For `backtrack_events`: revisits the named step, applies the new answer, re-routes, and asserts the reducer's existing staleness machinery (`getStaleSteps`/`repropagate`) fired as expected.
4. Records every step id / edge visited (for the coverage gate) and the resulting `finalIR`.
5. Asserts `expected_outcomes` against the final state.

## Entity: coverage report shape (NEW, FR-006/FR-008)

**File**: `packages/studio/src/dashboard/journeyCoverage.ts`

```ts
interface CoverageEntry {
  stepId: string;
  edgeType: "spine" | "fork" | "join";
  covered_by: string[];   // journey_ids that exercise this step/edge
}

interface CoverageReport {
  generatedAt: string;
  totalSteps: number;
  coveredSteps: number;
  uncovered: CoverageEntry[];   // stepId/edgeType with covered_by: []
  entries: CoverageEntry[];      // full list, for machine querying
}
```

Computed by comparing `buildManifestStepGraph()`'s full edge/step set (research R3) against the union of each fixture's `collectRenderedNodeIds(buildFlowSources())` result (research R2), keyed by which fixture(s) rendered which nodes.

## No entities diverge from the spec's proposed model — this file corrects only the underlying function names research found had drifted (buildManifestStepGraph, collectRenderedNodeIds, buildFlowSources), not the shape of what this feature builds.

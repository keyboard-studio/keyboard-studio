# Contract: Journey fixture schema + replay/coverage API

## `replayJourney`

```ts
function replayJourney(fixture: JourneyFixture): Promise<ReplayResult>
```

- Loads modular flows via `loadModularFlow` (unchanged, existing).
- Drives cross-manifest-step transitions via `steps/advance.ts`'s `advance()`/`nextSpineStepAfter()` and `steps/reducer.ts`'s `applyStepCompletion()`.
- Drives intra-step question routing (inside a single manifest step's own modular flow, e.g. `characters`) via `SurveyRunner.tsx`'s `evalCondition`/`resolveNext`/`advanceThrough`.
- Applies `workingCopyStore`'s `recordPhase`/`recordAssignments` for survey-answer events; records action summaries verbatim (no per-key decomposition) for `gallery_edit`/`mechanism_edit`/`touch_edit` events (FR-002/FR-015).
- Instantiates a fresh working copy per call, discards it after assertions (FR-004) — no cross-call state.
- For `backtrack_events`: revisits the named `stepId`, applies the new answer, re-routes from that point, and asserts the staleness closure over downstream steps reconciles per the working-copy spine rules (FR-005).
- Returns `ReplayResult` with `assertionsPassed` set after comparing the final state against `fixture.expected_outcomes`.

## `coverage-report`

```ts
function computeCoverageReport(fixtures: readonly JourneyFixture[]): CoverageReport
```

- Runs each fixture's answer set through the render-set computation (`buildFlowSources()` + `collectRenderedNodeIds()`), unions the results.
- Compares the union against `buildManifestStepGraph()`'s full step/edge set.
- Returns one `CoverageReportEntry` per manifest element, `covered_by: []` marking a gap.
- Report-only for this landing (exit 0 always) — a ratchet mode is a documented follow-up once a baseline exists (research R6).

## Fixture authoring rules

- `journey_id` MUST be unique across `content/journeys/`.
- `events` MUST be ordered; each entry's `stepId` MUST resolve against the live manifest (`packages/studio/src/steps/manifest.ts`).
- `expected_outcomes.routing_group` and `.strategy` are REQUIRED; additional key-IR assertions are OPTIONAL and fixture-specific.
- `backtrack_events`, when present, MUST name a `stepId` already visited earlier in `events`.

## Non-goals (explicit, per spec.md)

- No `__ksE2E__` telemetry export (FR-013).
- No bulk-scan of the 438-keyboard import corpus into fixtures (FR-014) — the four fixtures are hand-authored only.
- No per-key gallery loop replay (FR-015) — action summaries only, pending spec #9's loop primitive.
- No `mutate()` write path, no contracts bump, no `KeyboardIR` schema change (FR-016).

// journeyCoverage — manifest edge-coverage gate for the journey corpus
// (spec 032, FR-006/FR-007/FR-008, US2).
//
// computeCoverageReport(fixtures) aggregates which fixtures declare events at
// which manifest steps and compares that union against buildManifestStepGraph()
// — the SAME step/edge graph the live Flow Map renders (dashboard/buildStepGraph.ts),
// so this gate can never drift from a second, hand-maintained manifest view.
//
// Coverage is computed STATICALLY from each fixture's own declared `events`
// (+ `backtrack_events[].revisit_step`) stepIds — not by re-running
// replayJourney() — because computeCoverageReport's contract signature
// (contracts/journey-fixture-schema.md) is synchronous while replayJourney()
// is async, and because a fixture's own event list IS the ground truth for
// "which manifest steps does this journey visit" (the same list T017/US3
// cross-checks persona metadata against). A fixture's declared stepId set is
// exactly its ReplayResult.exercisedStepIds set for every step this feature's
// four fixtures reach (none of the four is rejected before reaching every
// step it declares an event for — see journey-runner.test.ts's SC-001 pass).
//
// Report-only for this landing (research R6): always returns/exits 0; a
// ratchet (CI-failing) mode is an explicitly deferred follow-up once a
// committed baseline exists to ratchet against (FR-007).

import { buildManifestStepGraph } from "./buildStepGraph.ts";
import { buildFlowSources, collectRenderedNodeIds } from "./renderedNodeSet.ts";
import type { StepGraphEdge } from "./model.ts";
import type { JourneyFixture } from "../survey/journeyFixture.ts";

// ---------------------------------------------------------------------------
// Report shape (data-model.md's coverage report entity, verbatim)
// ---------------------------------------------------------------------------

export interface CoverageEntry {
  stepId: string;
  edgeType: "spine" | "fork" | "join";
  covered_by: string[];
}

export interface CoverageReport {
  generatedAt: string;
  totalSteps: number;
  coveredSteps: number;
  /** Entries with covered_by: [] — steps exercised by zero fixtures. */
  uncovered: CoverageEntry[];
  /** Every manifest step, for machine querying. */
  entries: CoverageEntry[];
}

// ---------------------------------------------------------------------------
// Per-step edgeType classification — the kind of the edge that REACHES a
// given step (spine steps are reached by a "spine" edge except the entry
// step, which has none and is still reported as "spine"; off-spine steps are
// reached by exactly one "fork" or "join" edge per the manifest's own M4/M4b
// invariants).
// ---------------------------------------------------------------------------

function classifyIncomingEdge(stepId: string, edges: readonly StepGraphEdge[]): CoverageEntry["edgeType"] {
  const incoming = edges.filter((e) => e.to === stepId);
  if (incoming.some((e) => e.kind === "join")) return "join";
  if (incoming.some((e) => e.kind === "fork")) return "fork";
  return "spine";
}

/** Every manifest stepId a fixture declares an event or backtrack revisit for. */
function declaredStepIds(fixture: JourneyFixture): Set<string> {
  const ids = new Set<string>();
  for (const e of fixture.events) ids.add(e.stepId);
  for (const bt of fixture.backtrack_events ?? []) ids.add(bt.revisit_step);
  return ids;
}

// ---------------------------------------------------------------------------
// computeCoverageReport — the public API (contracts/journey-fixture-schema.md)
// ---------------------------------------------------------------------------

export function computeCoverageReport(fixtures: readonly JourneyFixture[]): CoverageReport {
  const stepGraph = buildManifestStepGraph();

  const perFixtureStepIds = fixtures.map((f) => ({ id: f.journey_id, ids: declaredStepIds(f) }));

  const entries: CoverageEntry[] = stepGraph.nodes.map((node) => {
    const coveredBy = perFixtureStepIds.filter((f) => f.ids.has(node.id)).map((f) => f.id);
    return {
      stepId: node.id,
      edgeType: classifyIncomingEdge(node.id, stepGraph.edges),
      covered_by: coveredBy,
    };
  });

  const uncovered = entries.filter((e) => e.covered_by.length === 0);

  return {
    generatedAt: new Date().toISOString(),
    totalSteps: entries.length,
    coveredSteps: entries.length - uncovered.length,
    uncovered,
    entries,
  };
}

// ---------------------------------------------------------------------------
// renderedNodeUniverseSize — informational only (T013's own citation of
// buildFlowSources()/collectRenderedNodeIds(), research R2). Reports the
// TOTAL rendered-node universe (every manifest step id + every live question
// id across every modular flow) for context alongside a CoverageReport —
// NOT filtered per fixture, since collectRenderedNodeIds computes the whole
// survey's static render set, not a specific answer-set's reachable subset
// (a real per-fixture QUESTION-level reachability figure would require
// replaying each fixture's answers through evalCondition/resolveNext, which
// is exactly ReplayResult.exercisedStepIds's job at the STEP granularity this
// report already uses — see this module's header). Exported separately so
// the coverage report itself stays exactly the locked shape data-model.md
// declares.
// ---------------------------------------------------------------------------

export function renderedNodeUniverseSize(): number {
  return collectRenderedNodeIds(buildFlowSources()).size;
}

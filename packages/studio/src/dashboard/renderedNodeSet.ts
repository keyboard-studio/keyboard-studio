// Shared rendered-node-id composition for the Flow Map (spec 016, D2a).
//
// ONE source of truth for "which node ids does the Flow Map actually renders".
// Both DashboardView/FlowMapView (the live UI) and the spec-016 drift guardrail
// (dashboard/driftGuardrail.test.ts) consume this module, so the guardrail
// asserts against the EXACT composition the dashboard renders — it cannot drift
// into a second, divergent composition.
//
// Spec 024 / ADR-0001: FLOW_SOURCES is retired. Drill-downs now DERIVE from the
// manifest step flowRefs declared in steps/manifest.ts (and registerEditorSteps.ts).
// The manifest is the single source of ordering truth; the Flow Map honours it.
//
// It re-uses the same builders the dashboard composes (do NOT re-derive):
//   • buildManifestProjection()  — the spec-015 StepGraph -> FlowGraph adapter
//                                   over buildManifestStepGraph() (the manifest spine).
//   • buildModularFlowGraph()    — the per-phase modular drill-down graphs over
//                                   flowSources (from steps/flowSources.ts),
//                                   keyed by questionRegistry.
//
// Boundary (.dependency-cruiser.cjs dashboard-layer rule): imports ONLY
// ./manifestProjection.ts, ./buildStepGraph.ts, ../steps/flowSources.ts,
// ../steps/manifest.ts, and the survey type. It imports NEITHER stores/ NOR
// editors/ — and deliberately NOT resolveNext (SurveyRunner.tsx ->
// stores/debugPinsStore.ts): runtime-reach traversal lives in the
// depcruise-excluded guardrail test, not here.

import { buildModularFlowGraph } from "./buildStepGraph.ts";
import { buildManifestProjection, attachDrillDowns, CHARACTERS_STEP_ID as _CHARACTERS_STEP_ID } from "./manifestProjection.ts";
import type { FlowGraph } from "./model.ts";
import { flowSources } from "../steps/flowSources.ts";
import { manifest } from "../steps/manifest.ts";

// Re-export CHARACTERS_STEP_ID so driftGuardrail and other callers don't need
// a separate import from manifestProjection.
export { CHARACTERS_STEP_ID } from "./manifestProjection.ts";

/**
 * One built drill-down: the modular FlowGraph (or null on parse failure) + its
 * error. Carries the `stepId` from the manifest step so attachDrillDowns can
 * group by manifest step id without re-reading FLOW_SOURCES.
 */
export interface BuiltFlowSource {
  graph: FlowGraph | null;
  error: string | null;
  title: string;
  /** The manifest step id this flow hangs under (threaded from the step's flowRefs). */
  stepId: string;
}

/**
 * Build one flowSources entry into a FlowGraph, failing visibly.
 * Threads `stepId` through to BuiltFlowSource so attachDrillDowns groups correctly.
 *
 * NOTE: safeBuild's internal undefined-guard + status check are redundant with the
 * checks buildFlowSources() already performs before calling it. Retained as a
 * defensive seam for Stage 2 (proposed-flow graph building), where safeBuild will
 * be called on proposed entries that bypass the status filter. Do NOT remove it.
 */
function safeBuild(
  sourceId: string,
  stepId: string,
): BuiltFlowSource {
  const source = flowSources[sourceId];
  if (source === undefined) {
    return {
      graph: null,
      error: `flowSources["${sourceId}"] not found — check steps/flowSources.ts`,
      title: sourceId,
      stepId,
    };
  }
  try {
    const graph = buildModularFlowGraph(source.raw, source.title, source.registry);
    return { graph, error: null, title: source.title, stepId };
  } catch (err) {
    return {
      graph: null,
      error: err instanceof Error ? err.message : String(err),
      title: source.title,
      stepId,
    };
  }
}

/**
 * buildFlowSources — derive the drill-down list by walking the manifest.
 *
 * For each manifest step, for each flowRef it declares, resolve the flowSource
 * entry and build its drill-down — but ONLY when status is "live". Proposed
 * entries (phase_a_identity) are excluded from live drill-downs; for Stage 1
 * they render only as a flat Library list (full ordered graphs come in Stage 2).
 *
 * The drill-down now hangs under the step that declares the ref:
 *   identity_lite -> "identity" step  (was mis-anchored under "characters")
 *   phase_f_helpdocs -> "help" step   (was mis-anchored under "characters")
 *   phase_b_characters -> "characters" step (correct placement, unchanged)
 *   track -> "track" step             (unchanged)
 *   project_name -> "project_name" step (unchanged)
 */
export function buildFlowSources(): BuiltFlowSource[] {
  const results: BuiltFlowSource[] = [];

  for (const step of manifest) {
    if (step.flowRefs === undefined || step.flowRefs.length === 0) continue;

    for (const ref of step.flowRefs) {
      const source = flowSources[ref];
      if (source === undefined) {
        // Unresolved ref — surface as an error entry so the map shows the gap.
        // Also fail loud at dev time so a missing flowSources entry is caught early.
        if (import.meta.env.DEV) {
          console.error(
            `[renderedNodeSet] unresolved flowRef "${ref}" on step "${step.id}" — add it to steps/flowSources.ts`,
          );
        }
        results.push({
          graph: null,
          error: `flowSources["${ref}"] not found — check steps/flowSources.ts`,
          title: ref,
          stepId: step.id,
        });
        continue;
      }

      // Only status:"live" entries appear in live drill-downs.
      // Proposed entries are excluded here; Stage 2 adds flat Library rendering.
      if (source.status !== "live") continue;

      results.push(safeBuild(ref, step.id));
    }
  }

  return results;
}

/**
 * collectRenderedNodeIds — the flat set of node ids the Flow Map actually renders
 * (spec 016, FR-002 / D2a).
 *
 * Composition (exactly what FlowMapView paints in the "flow" section):
 *   • the manifest spine projection nodes (buildManifestProjection(), the 015
 *     StepGraph -> FlowGraph adapter over buildManifestStepGraph()), UNION
 *   • the node ids of each per-phase drill-down FlowGraph (buildModularFlowGraph
 *     over flowSources, attached under their respective manifest step nodes).
 *
 * Reserve / library nodes (kind:"library-not-in-flow" — registered-but-unreachable
 * registry modules that computeReserveNodes appends so the reserve set stays
 * visible) are EXCLUDED: the spec-016 bijection is over the REACHABLE rendered
 * set only, and reserve ids are reachable on neither runtime side.
 *
 * Pure and store-free. The guardrail passes buildFlowSources() (or the same
 * drill-down inputs DashboardView builds) so both consume one composition.
 */
export function collectRenderedNodeIds(flows: ReadonlyArray<BuiltFlowSource>): Set<string> {
  const ids = new Set<string>();

  // Manifest spine (015 adapter) — every projected step node.
  for (const node of buildManifestProjection().nodes) {
    ids.add(node.id);
  }

  // Drill-downs under each manifest step — every live question node id, excluding
  // the reserve/library set so the bijection covers only the reachable rendered set.
  const allDrillDowns = attachDrillDowns(flows);
  for (const stepDrillDowns of Object.values(allDrillDowns)) {
    for (const dd of stepDrillDowns) {
      if (dd.graph === null) continue;
      for (const node of dd.graph.nodes) {
        if (node.kind === "library-not-in-flow") continue;
        ids.add(node.id);
      }
    }
  }

  return ids;
}

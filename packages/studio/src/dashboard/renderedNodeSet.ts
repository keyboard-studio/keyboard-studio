// Shared rendered-node-id composition for the Flow Map (spec 016, D2a).
//
// ONE source of truth for "which node ids does the Flow Map actually render".
// Both DashboardView/FlowMapView (the live UI) and the spec-016 drift guardrail
// (dashboard/driftGuardrail.test.ts) consume this module, so the guardrail
// asserts against the EXACT composition the dashboard renders — it cannot drift
// into a second, divergent composition.
//
// It re-uses the same builders the dashboard composes (do NOT re-derive):
//   • buildManifestProjection()  — the spec-015 StepGraph -> FlowGraph adapter
//                                   over buildManifestStepGraph() (the manifest spine).
//   • buildModularFlowGraph()    — the per-phase modular drill-down graphs over
//                                   FLOW_SOURCES, keyed by questionRegistry.
//
// Boundary (.dependency-cruiser.cjs dashboard-layer rule): imports ONLY
// ./manifestProjection.ts, ./buildStepGraph.ts, the per-phase registries under
// ../survey/questions/, the survey type, and the FLOW_SOURCES *.modular.yaml ?raw
// sources. It imports NEITHER stores/ NOR editors/ — and deliberately NOT
// resolveNext (SurveyRunner.tsx -> stores/debugPinsStore.ts): runtime-reach
// traversal lives in the depcruise-excluded guardrail test, not here.

import identityLiteModularRaw from "../../../../content/flows/identity_lite.modular.yaml?raw";
import phaseAModularRaw from "../../../../content/flows/phase_a_identity.modular.yaml?raw";
import phaseBModularRaw from "../../../../content/flows/phase_b_characters.modular.yaml?raw";
import phaseFModularRaw from "../../../../content/flows/phase_f_helpdocs.modular.yaml?raw";

import { buildModularFlowGraph } from "./buildStepGraph.ts";
import { buildManifestProjection, attachDrillDowns, CHARACTERS_STEP_ID } from "./manifestProjection.ts";
import type { FlowGraph } from "./model.ts";
import { phaseARegistry } from "../survey/questions/registry.a.ts";
import { phaseBRegistry } from "../survey/questions/registry.b.ts";
import { phaseFRegistry } from "../survey/questions/registry.f.ts";
import type { QuestionModule } from "../survey/types.ts";

/** Single shape for all flow source entries — all sections use the modular loader. */
export interface FlowSourceEntry {
  raw: string;
  title: string;
  registry: Readonly<Record<string, QuestionModule>>;
}

/**
 * The four per-phase modular sources the Flow Map renders as registry-keyed
 * drill-downs. Shared so DashboardView and the guardrail iterate the SAME list.
 * Do NOT import the legacy *.yaml files here — they are retired.
 */
export const FLOW_SOURCES: ReadonlyArray<FlowSourceEntry> = [
  // Identity-lite uses the Phase A registry (il_* modules are registered there).
  { raw: identityLiteModularRaw, title: "Identity-lite (Phase A head)", registry: phaseARegistry },
  { raw: phaseAModularRaw, title: "Phase A — identity", registry: phaseARegistry },
  { raw: phaseBModularRaw, title: "Phase B — character discovery", registry: phaseBRegistry },
  { raw: phaseFModularRaw, title: "Phase F — help docs", registry: phaseFRegistry },
];

/** One built drill-down: the modular FlowGraph (or null on parse failure) + its error. */
export interface BuiltFlowSource {
  graph: FlowGraph | null;
  error: string | null;
  title: string;
}

/**
 * Build one FLOW_SOURCES entry into a FlowGraph, failing visibly (never falling
 * back to the legacy YAML for a modular source — FR-011).
 */
export function safeBuild(entry: FlowSourceEntry): BuiltFlowSource {
  try {
    const graph = buildModularFlowGraph(entry.raw, entry.title, entry.registry);
    return { graph, error: null, title: entry.title };
  } catch (err) {
    return { graph: null, error: err instanceof Error ? err.message : String(err), title: entry.title };
  }
}

/** Build every FLOW_SOURCES entry — the drill-down inputs the dashboard renders. */
export function buildFlowSources(): BuiltFlowSource[] {
  return FLOW_SOURCES.map(safeBuild);
}

/**
 * collectRenderedNodeIds — the flat set of node ids the Flow Map actually renders
 * (spec 016, FR-002 / D2a).
 *
 * Composition (exactly what FlowMapView paints in the "flow" section):
 *   • the manifest spine projection nodes (buildManifestProjection(), the 015
 *     StepGraph -> FlowGraph adapter over buildManifestStepGraph()), UNION
 *   • the node ids of each per-phase drill-down FlowGraph (buildModularFlowGraph
 *     over FLOW_SOURCES, attached under the "characters" step).
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

  // Drill-downs under "characters" — every live question node id, excluding the
  // reserve/library set so the bijection covers only the reachable rendered set.
  const drillDowns = attachDrillDowns(flows)[CHARACTERS_STEP_ID] ?? [];
  for (const dd of drillDowns) {
    if (dd.graph === null) continue;
    for (const node of dd.graph.nodes) {
      if (node.kind === "library-not-in-flow") continue;
      ids.add(node.id);
    }
  }

  return ids;
}

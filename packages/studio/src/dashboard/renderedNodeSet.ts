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
// Spec 022: phase_a_identity.modular.yaml is intentionally NOT imported here — the
// full non-identity Phase A is demoted to the inert library (see FLOW_SOURCES below).
import phaseBModularRaw from "../../../../content/flows/phase_b_characters.modular.yaml?raw";
import phaseFModularRaw from "../../../../content/flows/phase_f_helpdocs.modular.yaml?raw";
import trackModularRaw from "../../../../content/flows/track.modular.yaml?raw";
import projectNameModularRaw from "../../../../content/flows/project_name.modular.yaml?raw";

import { buildModularFlowGraph } from "./buildStepGraph.ts";
import { buildManifestProjection, attachDrillDowns, CHARACTERS_STEP_ID } from "./manifestProjection.ts";
import type { FlowGraph } from "./model.ts";
import { phaseARegistry } from "../survey/questions/registry.a.ts";
import { phaseBRegistry } from "../survey/questions/registry.b.ts";
import { phaseFRegistry } from "../survey/questions/registry.f.ts";
import { phaseTrackRegistry, phaseProjectRegistry } from "../survey/questions/registry.g.ts";
import type { QuestionModule } from "../survey/types.ts";

/** Single shape for all flow source entries — all sections use the modular loader. */
export interface FlowSourceEntry {
  raw: string;
  title: string;
  registry: Readonly<Record<string, QuestionModule>>;
  /**
   * The manifest step id this flow hangs under as a drill-down.
   * Identity-lite / Phase A/B/F hang under "characters"; Phase G flows hang
   * under their own manifest step ids ("track", "project_name").
   */
  stepId: string;
}

/**
 * The six per-phase modular sources the Flow Map renders as registry-keyed
 * drill-downs. Shared so DashboardView and the guardrail iterate the SAME list.
 * Do NOT import the legacy *.yaml files here — they are retired.
 */
export const FLOW_SOURCES: ReadonlyArray<FlowSourceEntry> = [
  // Identity-lite uses the Phase A registry (il_* modules are registered there).
  { raw: identityLiteModularRaw, title: "Identity-lite (Phase A head)", registry: phaseARegistry, stepId: CHARACTERS_STEP_ID },
  // Spec 022 (library demote): the full non-identity Phase A
  // (phase_a_identity.modular.yaml — 15 identity + 15 provenance_*) is DEMOTED to the
  // inert library. It is the orphaned, vestigial battery — StudioShell renders
  // IdentityLite, never PhaseA; identity_lite is the canonical identity experience.
  // Removing it from the active flow-source set makes its 30 modules render as
  // registry-only RESERVE nodes (kind:"library-not-in-flow") via computeReserveNodes
  // in the identity-lite drill-down (reserveIds = phaseARegistry − live il_* ids):
  // present on the map, off the runtime/reachable spine. NOT deletion — every module
  // stays registered (phaseARegistry), on disk, and test-covered (no-delete guardrail,
  // §4 / noDeleteGuardrail.test.ts); revivable by re-adding this entry. The spec-017
  // prefill drill-down anchor moved off the demoted `primary_script` to the live
  // `il_target_script` (drillDownDeclarations.ts) so the bijection stays green.
  { raw: phaseBModularRaw, title: "Phase B — character discovery", registry: phaseBRegistry, stepId: CHARACTERS_STEP_ID },
  { raw: phaseFModularRaw, title: "Phase F — help docs", registry: phaseFRegistry, stepId: CHARACTERS_STEP_ID },
  // Phase G: track_choice and project_name hang under their own manifest steps.
  // Each uses its FLOW-SCOPED registry so the drill-down does not surface the
  // sibling flow's questions as reserve/library nodes.
  { raw: trackModularRaw, title: "Phase G — track selection", registry: phaseTrackRegistry, stepId: "track" },
  { raw: projectNameModularRaw, title: "Phase G — project name", registry: phaseProjectRegistry, stepId: "project_name" },
];

/**
 * One built drill-down: the modular FlowGraph (or null on parse failure) + its
 * error. Carries the `stepId` from the FlowSourceEntry so attachDrillDowns can
 * group by manifest step id without re-reading FLOW_SOURCES.
 */
export interface BuiltFlowSource {
  graph: FlowGraph | null;
  error: string | null;
  title: string;
  /** The manifest step id this flow hangs under (threaded from FlowSourceEntry). */
  stepId: string;
}

/**
 * Build one FLOW_SOURCES entry into a FlowGraph, failing visibly (never falling
 * back to the legacy YAML for a modular source — FR-011). Threads `stepId`
 * through to BuiltFlowSource so attachDrillDowns can group correctly.
 */
export function safeBuild(entry: FlowSourceEntry): BuiltFlowSource {
  try {
    const graph = buildModularFlowGraph(entry.raw, entry.title, entry.registry);
    return { graph, error: null, title: entry.title, stepId: entry.stepId };
  } catch (err) {
    return { graph: null, error: err instanceof Error ? err.message : String(err), title: entry.title, stepId: entry.stepId };
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
 *     over FLOW_SOURCES, attached under their respective manifest step nodes).
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

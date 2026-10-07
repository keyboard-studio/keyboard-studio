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
//   • buildDerivedFlowGraph()    — the per-flow derived drill-down graphs over
//                                   flowSources (from steps/flowSources.ts),
//                                   keyed by questionRegistry.
//
// Boundary (.dependency-cruiser.cjs dashboard-layer rule): the rule forbids only
// stores/ and editors/. This module imports ./manifestProjection.ts,
// ./buildStepGraph.ts, ../steps/{flowSources,manifest}.ts, and — for the spec-025
// Library section — ../survey/questions/registry.ts
// (the same survey/ reach manifestProjection.ts already uses; dashboard/ -> survey/
// is allowed). It imports NEITHER stores/ NOR editors/ — and deliberately NOT
// resolveNext (SurveyRunner.tsx -> stores/debugPinsStore.ts): runtime-reach
// traversal lives in the depcruise-excluded guardrail test, not here.

import { devLog } from "@keyboard-studio/contracts/dev-log";
import { buildDerivedFlowGraph, buildProposedFlowGraphFromFlow, buildLibraryReserveNodes, buildLeftoverNodes } from "./buildStepGraph.ts";
import { loadFlowSourceDef } from "../steps/flowSources.ts";
import { buildManifestProjection, attachDrillDowns, CHARACTERS_STEP_ID as _CHARACTERS_STEP_ID } from "./manifestProjection.ts";
import type { FlowGraph, GraphNode } from "./model.ts";
import { flowSources, screenIdForFlow } from "../steps/flowSources.ts";
import { manifest } from "../steps/manifest.ts";
import type { FlowDef } from "../survey/types.ts";
import { questionRegistry, reserveModules, moduleRecord } from "../survey/questions/registry.ts";

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
 * Caller pre-validates that sourceId exists, but defensive guard retained for clarity.
 */
function safeBuild(sourceId: string, stepId: string): BuiltFlowSource {
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
    // loadFlowSourceDef resolves the ordering source (derived modules or the
    // thin YAML) — one path for every flow, however many are migrated.
    const graph = buildDerivedFlowGraph(
      loadFlowSourceDef(source),
      source.title,
      source.registry,
    );
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
 * Which screen each flow hangs under, derived from screen membership
 * (spec 091 T014 — steps no longer declare flowRefs): a flow's screen is
 * the derived screen holding its modules, via steps/flowSources.ts's
 * `screenIdForFlow` (the one source; every module of a flow sits on the
 * same screen by construction — a flow is one screen's question set, or
 * the intra-step set of one custom screen).
 */
const flowScreenByFlowId: ReadonlyMap<string, string> = new Map(
  Object.values(flowSources).flatMap((source) => {
    const screenId = screenIdForFlow(source.id);
    return screenId === undefined ? [] : [[source.id, screenId] as const];
  }),
);

/**
 * buildFlowSources — derive the drill-down list by walking the manifest.
 *
 * For each manifest step (screen), build the drill-down of every LIVE
 * flow whose modules are members of that screen. Proposed entries
 * (phase_a_identity) are excluded from live drill-downs; they render
 * only in the Library section.
 *
 * The drill-down hangs under the screen holding the flow's modules:
 *   identity_lite -> "identity"    phase_f_helpdocs -> "help"
 *   phase_b_characters -> "characters"
 *   track -> "track"               project_name -> "project_name"
 */
export function buildFlowSources(): BuiltFlowSource[] {
  const results: BuiltFlowSource[] = [];

  for (const step of manifest) {
    for (const source of Object.values(flowSources)) {
      if (source.status !== "live") continue;
      if (flowScreenByFlowId.get(source.id) !== step.id) continue;
      results.push(safeBuild(source.id, step.id));
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
 *   • the node ids of each per-phase drill-down FlowGraph (buildDerivedFlowGraph
 *     over flowSources, attached under their respective manifest step nodes).
 *
 * Reserve / library nodes (kind:"library-not-in-flow" — registered-but-unreachable
 * registry modules that computeReserveNodes appends so the reserve set stays
 * visible) are EXCLUDED: the spec-016 bijection is over the REACHABLE rendered
 * set only, and reserve ids are reachable on neither runtime side.
 *
 * spec 025 (FR-006): PROPOSED-flow node ids are likewise excluded from the
 * bijection — by construction, not by a filter. `flows` here is always
 * buildFlowSources() output, which skips status:"proposed" entries, so proposed
 * graphs are never traversed by this function. The Library section
 * (buildLibrarySection, below) is a separate composition the bijection ignores.
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

// ---------------------------------------------------------------------------
// spec 025 (D6): the Library section — proposed-flow ordered graphs + flat
// reserve + dual-reference ("also live") detection. Kept in this shared module
// (alongside buildFlowSources / collectRenderedNodeIds) so the Flow Map and any
// guardrail consume ONE composition.
// ---------------------------------------------------------------------------

/** One proposed flow built for the Library section (fail-visibly, like BuiltFlowSource). */
export interface BuiltProposedFlow {
  /** flow_id of the proposed flow. */
  id: string;
  /** The ordered proposed FlowGraph (kind:"proposed" nodes), or null on parse failure. */
  graph: FlowGraph | null;
  /** Parse error message when graph is null. */
  error: string | null;
  /** Friendly title (mirrors the flowSources entry title). */
  title: string;
}

/**
 * The complete Library section (spec 025):
 *   • proposed        — ordered proposed-flow graphs (kind:"proposed" / region:"library")
 *   • reserve         — flat reserve nodes (registry modules in NO flow at all)
 *   • dualReferenced  — question ids in BOTH a live and a proposed flow ("also live",
 *                       a WARN signal — badged in the proposed graphs, never a failure)
 */
export interface LibrarySection {
  proposed: BuiltProposedFlow[];
  reserve: GraphNode[];
  dualReferenced: string[];
}

/** One flowSources entry parsed ONCE, so the id-collection and graph-build passes
 *  cannot diverge on a parse failure and the same YAML is not parsed twice. */
interface ParsedSource {
  id: string;
  title: string;
  status: "live" | "proposed";
  flow: FlowDef | null;
  error: string | null;
}

/**
 * Parse every flowSources entry once. A parse failure is recorded (not swallowed):
 * it surfaces both as a null flow (so the entry contributes no ids) AND as an error
 * on the built graph, and is logged in DEV — matching buildFlowSources' fail-loud
 * behaviour so the id-collection and graph-build passes stay consistent.
 */
function parseAllSources(): ParsedSource[] {
  return Object.values(flowSources).map((source) => {
    try {
      return {
        id: source.id,
        title: source.title,
        status: source.status,
        flow: loadFlowSourceDef(source),
        error: null,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (import.meta.env.DEV) {
        devLog.error(`[renderedNodeSet] flowSources["${source.id}"] failed to parse — ${message}`);
      }
      return {
        id: source.id,
        title: source.title,
        status: source.status,
        flow: null,
        error: message,
      };
    }
  });
}

/** Collect the question + provenance ids of a parsed flow. */
function flowIds(flow: FlowDef, into: Set<string>): void {
  for (const q of flow.questions) into.add(q.id);
  for (const q of flow.provenance_questions ?? []) into.add(q.id);
}

/**
 * buildLibrarySection — compose the Flow Map's Library section (spec 025, D6).
 *
 * Parses every flowSources entry ONCE (parseAllSources), then: builds each
 * status:"proposed" entry as an ordered graph (fail-visibly per entry), marks
 * "also live" dual-references, and computes the flat reserve (registry modules in
 * no flow at all — neither live nor proposed).
 */
export function buildLibrarySection(): LibrarySection {
  const parsed = parseAllSources();

  const liveIds = new Set<string>();
  const proposedIds = new Set<string>();
  for (const p of parsed) {
    if (p.flow === null) continue;
    flowIds(p.flow, p.status === "live" ? liveIds : proposedIds);
  }

  // FR-005: "also live" = a question id in BOTH a live and a proposed flow.
  const dualReferenced = [...proposedIds].filter((id) => liveIds.has(id)).sort();

  // Build each proposed flow as an ordered graph from its already-parsed FlowDef.
  const proposed: BuiltProposedFlow[] = parsed
    .filter((p) => p.status === "proposed")
    .map((p) => ({
      id: p.id,
      title: p.title,
      graph: p.flow !== null ? buildProposedFlowGraphFromFlow(p.flow, p.title, liveIds) : null,
      error: p.error,
    }));

  // FR-004: flat reserve = registry modules in NO flow at all (live or proposed).
  const inAnyFlow = new Set<string>([...liveIds, ...proposedIds]);
  const reserve = buildLibraryReserveNodes(questionRegistry, inAnyFlow);

  return { proposed, reserve, dualReferenced };
}

// ---------------------------------------------------------------------------
// Leftover section — registered questions used by NO live flow.
//
// Kept for reference / future reuse (spec-022 no-delete: still registered, on
// disk, and test-covered), but never run by the live survey and never rendered as
// reserve clog inside a live drill-down. This is a SEPARATE composition from the
// live drill-downs (buildFlowSources) and from the Library section
// (buildLibrarySection) — the Flow Map paints it under its own heading.
// ---------------------------------------------------------------------------

/**
 * buildLeftoverSection — every module physically relocated to the reserve
 * set (questions/reserve/, `reserveModules` in registry.ts).
 *
 * Sourced DIRECTLY from reserveModules — not derived by subtracting the live
 * flow ids from questionRegistry. The reserve folder/registry IS the Leftover
 * set: a module lives there if and only if it is demoted, so this always
 * matches physical reality and can never silently diverge from a live flow's
 * id list. Every reserve module renders as a kind:"library-not-in-flow"
 * / region:"leftover" node (via buildLeftoverNodes with an empty "in-flow" set,
 * so nothing is excluded).
 *
 * Excluded from the rendered<->runtime bijection by construction: collectRenderedNodeIds
 * never traverses this composition (like the Library section).
 */
export function buildLeftoverSection(): GraphNode[] {
  return buildLeftoverNodes(moduleRecord(reserveModules), new Set());
}

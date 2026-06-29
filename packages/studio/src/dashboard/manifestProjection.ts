// Map projection — StepGraph → FlowGraph/GraphNode adapter (spec 015, DEC-001 = Variant A).
//
// buildManifestStepGraph() (./buildStepGraph.ts) returns a StepGraph of
// StepGraphNodes (type:"editor-step"|"question-step", spine, lock, joinTarget,
// writePaths, inputPaths). The dashboard's layout (layoutFlowGraph, ./layout.ts)
// and renderer (FlowGraphView, ./FlowGraphView.tsx) consume FlowGraph / GraphNode
// only — a *different* type that carries kind:NodeKind + region:NodeRegion.
//
// This module is the type adaptation (not a one-line renderer switch): it maps
// each StepGraphNode to a GraphNode stamped kind:"stub" (lighting the previously
// dead "stub (gallery / wizard step)" legend swatch at DashboardView.tsx:114 and
// the stub palette at FlowGraphView.tsx:47-49), maps each StepGraphEdge to a
// GraphEdge (spine→linear, fork→default, join→default), and exposes the four
// per-phase buildModularFlowGraph() graphs as registry-keyed drill-downs hung
// under their manifest question-step nodes (FR-004).
//
// Read-only / store-free: imports buildManifestStepGraph + model types from the
// dashboard layer, FLOW_SOURCES building blocks, and questionRegistry from
// ../survey/questions/registry.ts. It imports NEITHER stores/ NOR editors/ —
// preserving the dashboard-layer depcruise boundary (.dependency-cruiser.cjs).

import { buildManifestStepGraph } from "./buildStepGraph.ts";
import type {
  FlowGraph,
  GraphEdge,
  GraphNode,
  StepGraph,
  StepGraphEdge,
  StepGraphNode,
} from "./model.ts";
import { questionRegistry } from "../survey/questions/registry.ts";

/**
 * Synthetic flow id for the projected manifest spine. The manifest is not a
 * survey FlowDef (it has no flow_id), so the projection labels every spine node
 * with this stable id — used for the FlowGraph.flowId and each GraphNode.flowId.
 */
export const MANIFEST_FLOW_ID = "manifest";

/**
 * Friendly title for the projected manifest-spine section on the Flow Map.
 */
export const MANIFEST_FLOW_TITLE = "Manifest spine (steps/manifest.ts)";

/**
 * Benign default `GraphNode.type` for projected manifest-step nodes.
 *
 * Manifest steps carry a StepNodeType ("editor-step" | "question-step"), which
 * is NOT a FlowQuestionType. `GraphNode.type` is informational for stub nodes
 * (it is only shown as descriptive text in FlowGraphView's node card; it drives
 * no styling or layout for kind:"stub"). "notice" is the closest non-interactive
 * FlowQuestionType — a step that surfaces information rather than collecting a
 * typed answer — so it is the benign default stamped on every projected node.
 */
export const MANIFEST_NODE_TYPE = "notice" as const;

/**
 * The drill-down attachment for one manifest question-step node: the four
 * per-phase buildModularFlowGraph() graphs that hang under it, each keyed by a
 * questionRegistry id (FR-004). The key is a registry id so a registry/manifest
 * divergence is observable (the seam spec 016's drift guardrail asserts against).
 */
export interface ManifestDrillDown {
  /** questionRegistry id this drill-down is keyed off. */
  registryKey: string;
  /** Friendly title (mirrors the FLOW_SOURCES entry title). */
  title: string;
  /** The per-phase modular FlowGraph (or null if it failed to build). */
  graph: FlowGraph | null;
  /** Parse error message when graph is null (preserves fail-visibly behavior). */
  error: string | null;
}

/**
 * The complete map projection: the manifest spine as a FlowGraph plus the
 * registry-keyed drill-downs grouped by the manifest question-step node id they
 * hang under.
 */
export interface ManifestProjection {
  /** The manifest spine, projected onto a FlowGraph for FlowGraphView/layout. */
  spine: FlowGraph;
  /**
   * Drill-downs grouped by the manifest step id they attach under.
   * In Phase 1 every per-phase question battery hangs under the "characters"
   * question-step node (the manifest placeholder for the Phase A/B/F batteries).
   */
  drillDowns: Record<string, ManifestDrillDown[]>;
}

/** Edge-kind projection: StepGraph order-kind → FlowGraph EdgeKind. */
function projectEdgeKind(kind: StepGraphEdge["kind"]): GraphEdge["kind"] {
  switch (kind) {
    case "spine":
      return "linear";
    case "fork":
    case "join":
      // Fork (spine→off-spine) and join (off-spine→joinTarget) are the side-trail
      // branches; render them as "default" branch edges (dashed) rather than the
      // solid linear spine, so the spine reads at a glance.
      return "default";
  }
}

/** Project one StepGraphNode onto a render-ready GraphNode (kind:"stub"). */
function projectNode(step: StepGraphNode): GraphNode {
  return {
    id: step.id,
    flowId: MANIFEST_FLOW_ID,
    label: step.label,
    type: MANIFEST_NODE_TYPE,
    required: false,
    engineResolved: false,
    advisory: false,
    isEntry: step.isEntry,
    isTerminal: step.isTerminal,
    isGate: false,
    optionCount: 0,
    // FR-002: every projected manifest editor-step is a stub — this is the sole
    // emitter of kind:"stub", lighting the previously-dead legend swatch.
    kind: "stub",
    // Consistent with model.ts:46 — stub nodes are not part of the ordered spine
    // taxonomy region "flow"; they sit in "not-yet-ordered".
    region: "not-yet-ordered",
  };
}

/** Project one StepGraphEdge onto a render-ready GraphEdge. */
function projectEdge(edge: StepGraphEdge): GraphEdge {
  return {
    from: edge.from,
    to: edge.to,
    kind: projectEdgeKind(edge.kind),
    // Manifest ids are all known (both endpoints are manifest steps), so a
    // projected edge is never dangling.
    dangling: false,
  };
}

/**
 * Project the manifest StepGraph onto a FlowGraph (DEC-001 = Variant A).
 *
 * One GraphNode per manifest step, every node kind:"stub" / region:"not-yet-ordered".
 * Order edges (spine/fork/join) are mapped onto GraphEdges (linear/default).
 * Data edges (writes→inputs) are NOT projected — the map shows the ordered spine,
 * not the data-dependency graph (those power completeness checks, not the map).
 *
 * Pure and read-only: reads only buildManifestStepGraph()'s output. No store,
 * editor, IR, or runtime write.
 */
export function buildManifestProjection(): FlowGraph {
  const stepGraph: StepGraph = buildManifestStepGraph();

  const nodes: GraphNode[] = stepGraph.nodes.map(projectNode);
  const edges: GraphEdge[] = stepGraph.edges.map(projectEdge);

  const entryNode = nodes.find((n) => n.isEntry);

  return {
    flowId: MANIFEST_FLOW_ID,
    phase: "manifest",
    title: MANIFEST_FLOW_TITLE,
    nodes,
    edges,
    entryId: entryNode ? entryNode.id : null,
    // All projected edges target known manifest ids — nothing dangles.
    danglingTargets: [],
  };
}

/**
 * The manifest question-step node every per-phase question battery hangs under.
 *
 * In Phase 1 the manifest represents the entire Phase A/B/F question battery as
 * a single "characters" placeholder step (steps/manifest.ts:47-56). The four
 * FLOW_SOURCES modular graphs are the intra-phase expansion of that battery, so
 * they hang as drill-downs under this node.
 */
export const CHARACTERS_STEP_ID = "characters";

/**
 * registryKeyForFlow — choose a questionRegistry id to key a drill-down off.
 *
 * The drill-down key MUST be a questionRegistry id (FR-004) so a registry/manifest
 * divergence is observable. We key each per-phase modular graph off the first of
 * its question nodes that is present in questionRegistry (the graph's entry into
 * the consolidated registry). Falls back to the graph's entry/first node id when
 * none of the nodes is in the registry (defensive — should not happen for a
 * modular-loaded graph, whose questions all come from the registry).
 */
export function registryKeyForFlow(graph: FlowGraph): string | null {
  for (const node of graph.nodes) {
    if (Object.prototype.hasOwnProperty.call(questionRegistry, node.id)) {
      return node.id;
    }
  }
  // Defensive fallback: a built modular graph always has registry-backed nodes,
  // but if not, key off the entry id (or the first node) so the attachment is
  // still deterministic and observable.
  return graph.entryId ?? graph.nodes[0]?.id ?? null;
}

/**
 * attachDrillDowns — hang the per-phase modular graphs under their manifest
 * question-step node, keyed by a questionRegistry id (FR-004).
 *
 * @param flows the per-phase modular graphs (the four FLOW_SOURCES, already built
 *              via safeBuild — each is { graph, error, title }).
 * @returns drill-downs grouped by the manifest step id they attach under.
 */
export function attachDrillDowns(
  flows: ReadonlyArray<{ graph: FlowGraph | null; error: string | null; title: string }>,
): Record<string, ManifestDrillDown[]> {
  const drillDowns: ManifestDrillDown[] = flows.map((f) => ({
    registryKey:
      f.graph !== null ? (registryKeyForFlow(f.graph) ?? f.title) : f.title,
    title: f.title,
    graph: f.graph,
    error: f.error,
  }));

  // Phase 1: all four batteries hang under the single "characters" placeholder.
  return { [CHARACTERS_STEP_ID]: drillDowns };
}

/**
 * buildManifestProjectionWithDrillDowns — the full projection used by the
 * dashboard: the spine FlowGraph + the registry-keyed drill-downs.
 */
export function buildManifestProjectionWithDrillDowns(
  flows: ReadonlyArray<{ graph: FlowGraph | null; error: string | null; title: string }>,
): ManifestProjection {
  return {
    spine: buildManifestProjection(),
    drillDowns: attachDrillDowns(flows),
  };
}

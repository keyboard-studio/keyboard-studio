// Derive a FlowGraph or StepGraph from a survey flow source or the step manifest.
//
// Two entry points:
//   buildModularFlowGraph(raw, title, registry) — modular path; resolves through
//                                                  loadModularFlow so the map
//                                                  matches the live runtime exactly.
//                                                  The caller supplies the registry
//                                                  for computing reserve nodes.
//   buildManifestStepGraph()                     — T031/C8: one node per
//                                                  steps/manifest.ts entry; node
//                                                  set == runtime step set.
//
// buildModularFlowGraph delegates to the loader-agnostic core
// buildGraphFromQuestions().
//
// Edge extraction mirrors SurveyRunner.resolveNext(): a `next` of a plain string
// is one linear edge; null/absent is terminal; a FlowGotoRule[] yields one edge
// per rule (conditional rules carry their condition text, the `default` rule is
// labelled "(else)"). A goto of `null` is a terminal branch and produces no edge.
// A goto target absent from the known id set is flagged as dangling (not dropped).

import { loadModularFlow } from "../survey/loadModularFlow.ts";
import type { FlowDef, FlowQuestion, QuestionModule } from "../survey/types.ts";
import { computeDataEdges } from "./model.ts";
import type { FlowGraph, GraphEdge, GraphNode, NodeKind, NodeRegion, StepGraph, StepGraphEdge, StepGraphNode } from "./model.ts";
import { ruleTarget } from "./flowUtils.ts";
import { manifest } from "../steps/manifest.ts";
import { formatIRPath } from "@keyboard-studio/contracts";

/**
 * Permissive view of a goto rule as actually authored in the flow YAML. The
 * declared FlowGotoRule type says `default?: true` + a required `goto`, but the
 * shipped flows use a `default: <targetId>` shorthand (and `default: null` for a
 * terminal else-branch). We read both forms so the map matches the authored
 * branching rather than the lagging type.
 */
interface RawGotoRule {
  condition?: string;
  goto?: string | null;
  default?: unknown;
}

/** prompt ?? label ?? id — the text the runner would surface. */
const nodeLabel = (q: FlowQuestion) => q.prompt ?? q.label ?? q.id;
const optionCount = (q: FlowQuestion) => Array.isArray(q.options) ? q.options.length : 0;

export interface BuildGraphOptions {
  /** Kind to stamp on all question nodes. Defaults to "live". */
  questionKind?: NodeKind;
  /**
   * Region to stamp on all question nodes. Defaults to "flow". Proposed-flow
   * graphs pass "library" (spec 025) so their question nodes sit in the Library
   * region rather than the live spine.
   */
  questionRegion?: NodeRegion;
  /** Pre-built extra nodes appended after question nodes (e.g. reserve nodes). */
  extraNodes?: GraphNode[];
}

/**
 * Loader-agnostic graph core.
 *
 * Builds a FlowGraph from a resolved FlowDef's questions. All question nodes
 * are marked with the supplied `questionKind` (defaults to "live").
 *
 * When `extraNodes` is supplied, those pre-built GraphNodes are appended to the
 * node list after the question nodes (used by the Phase B modular path to append
 * "library-not-in-flow" reserve nodes).
 */
export function buildGraphFromQuestions(
  flow: FlowDef,
  title: string,
  options: BuildGraphOptions = {},
): FlowGraph {
  const { questionKind = "live", questionRegion = "flow", extraNodes = [] } = options;
  // Phase A keeps a supplemental `provenance_questions` list that the main
  // questions branch into; include it so those goto targets resolve.
  const questions: FlowQuestion[] = [...flow.questions, ...(flow.provenance_questions ?? [])];
  const knownIds = new Set(questions.map((q) => q.id));

  const edges: GraphEdge[] = [];
  const danglingTargets = new Set<string>();
  /** outgoing edge count per node id (drives isTerminal). */
  const outDegree = new Map<string, number>();

  const addEdge = (from: string, to: string, kind: GraphEdge["kind"], label?: string) => {
    const dangling = !knownIds.has(to);
    if (dangling) danglingTargets.add(to);
    const edge: GraphEdge = { from, to, kind, dangling };
    if (label !== undefined) edge.label = label;
    edges.push(edge);
    outDegree.set(from, (outDegree.get(from) ?? 0) + 1);
  };

  for (const q of questions) {
    const { next } = q;
    if (!next) continue; // terminal

    if (typeof next === "string") {
      addEdge(q.id, next, "linear");
      continue;
    }
    // Rule list — conditional branching (this question gates the flow).
    for (const rule of next as RawGotoRule[]) {
      const target = ruleTarget(rule);
      if (target === null) continue; // terminal branch — no edge
      const kind = rule.condition !== undefined ? "conditional" : "default";
      const label = rule.condition !== undefined ? rule.condition : "(else)";
      addEdge(q.id, target, kind, label);
    }
  }

  const entryId = flow.questions.length > 0 ? flow.questions[0]!.id : null;

  const questionNodes: GraphNode[] = questions.map((q) => ({
    id: q.id,
    flowId: flow.flow_id,
    label: nodeLabel(q),
    type: q.type,
    required: q.required === true,
    engineResolved: q.engine_resolved === true,
    advisory: q.advisory === true,
    isEntry: q.id === entryId,
    isTerminal: (outDegree.get(q.id) ?? 0) === 0,
    isGate: Array.isArray(q.next),
    optionCount: optionCount(q),
    kind: questionKind,
    region: questionRegion,
  }));

  const nodes: GraphNode[] = [...questionNodes, ...extraNodes];

  return {
    flowId: flow.flow_id,
    phase: flow.phase,
    title,
    nodes,
    edges,
    entryId,
    danglingTargets: [...danglingTargets],
  };
}

/**
 * Build one reserve GraphNode from a registry module. Shared by computeReserveNodes
 * (per-flow reserve, region "not-yet-ordered") and buildLibraryReserveNodes
 * (global Library reserve, region "library"). Reserve nodes are always
 * kind:"library-not-in-flow", terminal, and carry no outgoing edges.
 */
function reserveNodeFor(
  mod: QuestionModule,
  flowId: string,
  region: NodeRegion,
): GraphNode {
  const def = mod.definition;
  return {
    id: def.id,
    flowId,
    label: def.prompt ?? def.label ?? def.id,
    type: def.type,
    required: def.required === true,
    engineResolved: def.engine_resolved === true,
    advisory: def.advisory === true,
    isEntry: false,
    isTerminal: true, // no outgoing edges; reserve nodes are not wired into any spine
    isGate: Array.isArray(def.next),
    optionCount: Array.isArray(def.options) ? def.options.length : 0,
    kind: "library-not-in-flow",
    region,
  };
}

/**
 * Compute reserve nodes: registry modules that are not referenced by the live
 * manifest. These carry kind "library-not-in-flow" and region "not-yet-ordered"
 * because they are NOT part of the ordered live spine.
 *
 * NOTE (spec 025): this per-flow computation is deliberately UNCHANGED. The live
 * drill-downs (e.g. identity-lite) still emit the demoted Phase A modules as
 * reserve nodes here — the byte-identical-live-map parity contract and the
 * spec-022 phaseADemoteReserve guardrail both lock this. The D6 "reserve = in no
 * flow at all" rule is realized by the SEPARATE buildLibraryReserveNodes below,
 * used only by the new Library section.
 */
function computeReserveNodes(
  flow: FlowDef,
  registry: Readonly<Record<string, QuestionModule>>,
): GraphNode[] {
  const liveIds = new Set([
    ...flow.questions.map((q) => q.id),
    ...(flow.provenance_questions ?? []).map((q) => q.id),
  ]);
  const reserveIds = Object.keys(registry).filter((id) => !liveIds.has(id));
  return reserveIds.flatMap((id) => {
    const mod = registry[id];
    return mod ? [reserveNodeFor(mod, flow.flow_id, "not-yet-ordered")] : [];
  });
}

/**
 * Build a normalized FlowGraph from a thin modular YAML string.
 *
 * Resolves questions through loadModularFlow (which uses the live consolidated
 * registry). Reserve modules — registered in the supplied registry but absent
 * from the manifest — are appended as "library-not-in-flow" nodes so the
 * reserve set is visible without claiming to be live.
 *
 * Throws (propagates loadModularFlow's error) if the manifest is empty,
 * unparseable, or references an unknown id. The caller is responsible for
 * surfacing the error rather than falling back to the legacy YAML.
 *
 * @param raw      the thin modular YAML source (Vite `?raw` import)
 * @param title    friendly section title for the map
 * @param registry the phase-appropriate registry for computing reserve nodes
 */
export function buildModularFlowGraph(
  raw: string,
  title: string,
  registry: Readonly<Record<string, QuestionModule>>,
): FlowGraph {
  const flow = loadModularFlow(raw);
  const reserveNodes = computeReserveNodes(flow, registry);
  return buildGraphFromQuestions(flow, title, { extraNodes: reserveNodes });
}

// ---------------------------------------------------------------------------
// spec 025 (D6): proposed-flow Library graph + global Library reserve.
// ---------------------------------------------------------------------------

/**
 * Build the ORDERED graph for a proposed flow (spec 025, FR-001).
 *
 * Resolves the thin YAML through loadModularFlow (same path as live flows) and
 * builds a FlowGraph whose question nodes carry kind:"proposed" / region:"library"
 * — so the demoted battery keeps its authored sequence and branching visually,
 * rather than collapsing to a flat reserve list. Unlike buildModularFlowGraph it
 * appends NO per-flow reserve nodes: a proposed graph shows only its own questions.
 *
 * FR-005 ("also live"): any question id present in `liveIds` (i.e. also listed in a
 * LIVE flow) is marked node.alsoLive = true so the Library graph can badge it. This
 * is a WARN signal, never a failure. `liveIds` must contain QUESTION ids that appear
 * in live survey YAML flows (e.g. flowQuestionIdsByStatus("live")) — NOT arbitrary
 * node ids such as manifest step ids, or the badging would be meaningless.
 *
 * Proposed-flow node ids are excluded from the rendered<->runtime bijection
 * (FR-006) — collectRenderedNodeIds never traverses these graphs.
 *
 * @param raw     the proposed thin-YAML source (Vite `?raw` import)
 * @param title   friendly section title for the Library graph
 * @param liveIds question ids that appear in any LIVE flow (for "also live" badging)
 */
export function buildProposedFlowGraph(
  raw: string,
  title: string,
  liveIds: ReadonlySet<string> = new Set(),
): FlowGraph {
  return buildProposedFlowGraphFromFlow(loadModularFlow(raw), title, liveIds);
}

/**
 * As buildProposedFlowGraph, but over an already-parsed FlowDef — lets a caller that
 * has already run loadModularFlow (e.g. buildLibrarySection, which also collects the
 * flow's ids) build the graph WITHOUT re-parsing the same YAML. See buildProposedFlowGraph
 * for the `liveIds` contract.
 */
export function buildProposedFlowGraphFromFlow(
  flow: FlowDef,
  title: string,
  liveIds: ReadonlySet<string> = new Set(),
): FlowGraph {
  const graph = buildGraphFromQuestions(flow, title, {
    questionKind: "proposed",
    questionRegion: "library",
  });
  for (const node of graph.nodes) {
    if (liveIds.has(node.id)) node.alsoLive = true;
  }
  return graph;
}

/**
 * Compute the flat Library reserve (spec 025, FR-004): registry modules that are
 * in NO flow at all — neither a live flow nor a proposed flow. Questions that
 * appear only in a proposed flow are NOT reserve (they render inside the proposed
 * graph); `inAnyFlow` must therefore include every proposed-flow question id too.
 *
 * Distinct from computeReserveNodes (per-flow, unchanged). Nodes carry
 * kind:"library-not-in-flow" and region:"library" so they render in the Library
 * section rather than under a live drill-down.
 *
 * @param registry  the (merged) question registry — the universe of all questions
 * @param inAnyFlow union of every question id listed in any live OR proposed flow
 * @param flowId    synthetic flow id stamped on the reserve nodes (default "library")
 */
export function buildLibraryReserveNodes(
  registry: Readonly<Record<string, QuestionModule>>,
  inAnyFlow: ReadonlySet<string>,
  flowId = "library",
): GraphNode[] {
  const reserveIds = Object.keys(registry).filter((id) => !inAnyFlow.has(id));
  return reserveIds.flatMap((id) => {
    const mod = registry[id];
    return mod ? [reserveNodeFor(mod, flowId, "library")] : [];
  });
}

// ---------------------------------------------------------------------------
// T031 / C8 / FR-010: buildManifestStepGraph
//
// Produces exactly one StepGraphNode per entry in steps/manifest.ts.
// The node set == the runtime step set by construction: both read the same
// `manifest` array.  Editing manifest.ts updates the dashboard automatically —
// no second ordering source exists.
//
// Boundary: this function imports manifest from ../steps/manifest.ts.
// dashboard/ -> steps/ is allowed by the dashboard-layer depcruise rule.
// dashboard/ -> survey/ is NOT imported here; survey data is accessed through
// the existing buildModularFlowGraph function above (which is preserved from P3
// to continue rendering the flow-level question graph).
// ---------------------------------------------------------------------------

/**
 * Build a StepGraph with exactly one node per entry in steps/manifest.ts.
 *
 * Satisfies C8 (node set == manifest step set; zero ghost/missing) and FR-010
 * ("map == runtime by construction" — both the dashboard and the SurveyView
 * runtime read the same `manifest` array).
 *
 * Edges produced:
 *   "spine" — linear progression between consecutive spine steps.
 *   "fork"  — from the preceding spine step to an off-spine step.
 *   "join"  — from an off-spine step back to its joinTarget.
 */
export function buildManifestStepGraph(): StepGraph {
  const nodes: StepGraphNode[] = manifest.map((step, idx) => {
    const writePaths = step.writes.map(formatIRPath);
    const inputPaths = step.inputs.map(formatIRPath);
    const node: StepGraphNode = {
      id: step.id,
      label: step.title,
      type: step.kind,
      spine: step.spine === true,
      isEntry: idx === 0,
      isTerminal: idx === manifest.length - 1,
      writePaths,
      inputPaths,
    };
    // exactOptionalPropertyTypes: only assign optional fields when they have a value.
    if (step.lock !== undefined) node.lock = step.lock;
    if (step.joinTarget !== undefined) node.joinTarget = step.joinTarget;
    return node;
  });

  const edges: StepGraphEdge[] = [];

  // Build a position map for O(1) joinTarget lookups.
  const idToIndex = new Map<string, number>(manifest.map((s, i) => [s.id, i]));

  for (let i = 0; i < manifest.length; i++) {
    const step = manifest[i]!;

    if (step.spine === true) {
      // Spine edge: connect to the next spine step (skipping off-spine steps).
      const nextSpineIdx = manifest.findIndex((s, idx) => idx > i && s.spine === true);
      if (nextSpineIdx !== -1) {
        edges.push({ from: step.id, to: manifest[nextSpineIdx]!.id, kind: "spine" });
      }

      // Fork edges: from this spine step to any off-spine step that immediately follows.
      for (let k = i + 1; k < manifest.length && manifest[k]!.spine !== true; k++) {
        edges.push({ from: step.id, to: manifest[k]!.id, kind: "fork" });
      }
    } else if (step.joinTarget !== undefined && idToIndex.has(step.joinTarget)) {
      // Off-spine join edge: from this step back to its joinTarget.
      edges.push({ from: step.id, to: step.joinTarget, kind: "join" });
    }
  }

  // Data edges: from producer → consumer where producer.writePaths ∩ consumer.inputPaths ≠ ∅.
  // These power C1 (staleness fixpoint), C2 (cycle detection), C5 (orphan inputs).
  const dataEdges: StepGraphEdge[] = computeDataEdges(nodes);

  return { nodes, edges, dataEdges };
}

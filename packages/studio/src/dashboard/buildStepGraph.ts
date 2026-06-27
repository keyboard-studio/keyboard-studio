// Derive a FlowGraph or StepGraph from a survey flow source or the step manifest.
//
// Three entry points:
//   buildFlowGraph(raw, title)         — legacy parseFlow path (Phase A / F /
//                                        identity-lite); no behavior change.
//   buildModularFlowGraph(raw, title)  — modular Phase B path; resolves through
//                                        loadModularFlow + phaseBRegistry so the
//                                        map matches the live runtime exactly.
//   buildManifestStepGraph()           — T031/C8: one node per steps/manifest.ts
//                                        entry; node set == runtime step set.
//
// buildFlowGraph and buildModularFlowGraph delegate to the loader-agnostic core
// buildGraphFromQuestions().
//
// Edge extraction mirrors SurveyRunner.resolveNext(): a `next` of a plain string
// is one linear edge; null/absent is terminal; a FlowGotoRule[] yields one edge
// per rule (conditional rules carry their condition text, the `default` rule is
// labelled "(else)"). A goto of `null` is a terminal branch and produces no edge.
// A goto target absent from the known id set is flagged as dangling (not dropped).

import { parseFlow } from "../survey/loadFlow.ts";
import { loadModularFlow } from "../survey/loadModularFlow.ts";
import { phaseBRegistry } from "../survey/questions/registry.b.ts";
import type { FlowDef, FlowQuestion, QuestionModule } from "../survey/types.ts";
import type { FlowGraph, GraphEdge, GraphNode, NodeKind, StepGraph, StepGraphEdge, StepGraphNode } from "./model.ts";
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
function nodeLabel(q: FlowQuestion): string {
  return q.prompt ?? q.label ?? q.id;
}

function optionCount(q: FlowQuestion): number {
  return Array.isArray(q.options) ? q.options.length : 0;
}

export interface BuildGraphOptions {
  /** Kind to stamp on all question nodes. Defaults to "live". */
  questionKind?: NodeKind;
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
  const { questionKind = "live", extraNodes = [] } = options;
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
    const next = q.next;
    if (next === undefined || next === null) {
      continue; // terminal
    }
    if (typeof next === "string") {
      addEdge(q.id, next, "linear");
      continue;
    }
    // Rule list — conditional branching (this question gates the flow).
    for (const rule of next as RawGotoRule[]) {
      const target = ruleTarget(rule);
      if (target === null) continue; // terminal branch — no edge
      if (rule.condition !== undefined) {
        addEdge(q.id, target, "conditional", rule.condition);
      } else {
        addEdge(q.id, target, "default", "(else)");
      }
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
    region: "flow",
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
 * Build a normalized FlowGraph from a `?raw` flow YAML string via the legacy
 * parseFlow loader. Used for Phase A / F / identity-lite — no behavior change.
 *
 * @param raw   the YAML source (Vite `?raw` import)
 * @param title friendly section title for the map
 */
export function buildFlowGraph(raw: string, title: string): FlowGraph {
  const flow = parseFlow(raw);
  return buildGraphFromQuestions(flow, title);
}

/**
 * Compute reserve nodes: registry modules that are not referenced by the live
 * manifest. These carry kind "library-not-in-flow" and region "not-yet-ordered"
 * because they are NOT part of the ordered live spine.
 */
function computeReserveNodes(
  flow: FlowDef,
  registry: Record<string, QuestionModule>,
): GraphNode[] {
  const liveIds = new Set(flow.questions.map((q) => q.id));
  const reserveIds = Object.keys(registry).filter((id) => !liveIds.has(id));
  return reserveIds.flatMap((id) => {
    const mod = registry[id];
    // Belt-and-suspenders: registry[id] should always be defined for a registry key.
    if (!mod) return [];
    const def = mod.definition;
    const node: GraphNode = {
      id: def.id,
      flowId: flow.flow_id,
      label: def.prompt ?? def.label ?? def.id,
      type: def.type,
      required: def.required === true,
      engineResolved: def.engine_resolved === true,
      advisory: def.advisory === true,
      isEntry: false,
      isTerminal: true, // no outgoing edges; reserve nodes are not wired into the spine
      isGate: Array.isArray(def.next),
      optionCount: Array.isArray(def.options) ? def.options.length : 0,
      kind: "library-not-in-flow",
      // Reserve nodes are NOT part of the ordered live spine — same region as stubs.
      region: "not-yet-ordered",
    };
    return [node];
  });
}

/**
 * Build a normalized FlowGraph from a Phase B thin modular YAML string.
 *
 * Resolves questions through loadModularFlow (which uses the live registry).
 * Reserve modules — registered in phaseBRegistry but absent from the manifest —
 * are appended as "library-not-in-flow" nodes so the reserve set is visible
 * without claiming to be live.
 *
 * Throws (propagates loadModularFlow's error) if the manifest is empty,
 * unparseable, or references an unknown id. The caller is responsible for
 * surfacing the error rather than falling back to the legacy YAML.
 *
 * @param raw   the thin modular YAML source (Vite `?raw` import)
 * @param title friendly section title for the map
 */
export function buildModularFlowGraph(raw: string, title: string): FlowGraph {
  const flow = loadModularFlow(raw);
  const reserveNodes = computeReserveNodes(flow, phaseBRegistry);
  return buildGraphFromQuestions(flow, title, { extraNodes: reserveNodes });
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
// the existing buildFlowGraph/buildModularFlowGraph functions above (which
// are preserved from P3 to continue rendering the flow-level question graph).
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
      // Spine edge: connect to the next spine step (skipping off-spine steps
      // that appear between them in the array).
      let j = i + 1;
      while (j < manifest.length && manifest[j]!.spine !== true) {
        j++;
      }
      if (j < manifest.length) {
        edges.push({ from: step.id, to: manifest[j]!.id, kind: "spine" });
      }

      // Fork edges: from this spine step to any off-spine step that immediately
      // follows it in the manifest array (and has this step as its implicit fork
      // origin — i.e., it appears before the next spine step).
      let k = i + 1;
      while (k < manifest.length && manifest[k]!.spine !== true) {
        edges.push({ from: step.id, to: manifest[k]!.id, kind: "fork" });
        k++;
      }
    } else {
      // Off-spine join edge: from this step back to its joinTarget.
      if (step.joinTarget !== undefined) {
        const targetIdx = idToIndex.get(step.joinTarget);
        if (targetIdx !== undefined) {
          edges.push({ from: step.id, to: step.joinTarget, kind: "join" });
        }
      }
    }
  }

  // Data edges: from producer → consumer where producer.writePaths ∩ consumer.inputPaths ≠ ∅.
  // These power C1 (staleness fixpoint), C2 (cycle detection), C5 (orphan inputs).
  const dataEdges: StepGraphEdge[] = [];
  for (const producer of nodes) {
    if (producer.writePaths.length === 0) continue;
    const writeSet = new Set(producer.writePaths);
    for (const consumer of nodes) {
      if (consumer.id === producer.id) continue;
      for (const inputPath of consumer.inputPaths) {
        if (writeSet.has(inputPath)) {
          dataEdges.push({ from: producer.id, to: consumer.id, kind: "spine" }); // kind reused; data edges have no order-kind
          break; // one data edge per (producer, consumer) pair
        }
      }
    }
  }

  return { nodes, edges, dataEdges };
}

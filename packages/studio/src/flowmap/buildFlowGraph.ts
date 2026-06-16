// Derive a FlowGraph from a raw flow YAML string.
//
// Reuses the survey's own parseFlow() so the map sees exactly what the runner
// sees. Edge extraction mirrors SurveyRunner.resolveNext(): a `next` of a plain
// string is one linear edge; null/absent is terminal; a FlowGotoRule[] yields
// one edge per rule (conditional rules carry their condition text, the
// `default` rule is labelled "(else)"). A goto of `null` is a terminal branch
// and produces no edge.

import { parseFlow } from "../survey/loadFlow.ts";
import type { FlowQuestion } from "../survey/types.ts";
import type { FlowGraph, GraphEdge, GraphNode } from "./model.ts";
import { ruleTarget } from "./flowUtils.ts";

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

/**
 * Build a normalized FlowGraph from a `?raw` flow YAML string.
 *
 * @param raw   the YAML source (Vite `?raw` import)
 * @param title friendly section title for the map
 */
export function buildFlowGraph(raw: string, title: string): FlowGraph {
  const flow = parseFlow(raw);
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

  const nodes: GraphNode[] = questions.map((q) => ({
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
  }));

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

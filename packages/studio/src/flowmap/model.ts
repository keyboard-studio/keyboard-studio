// Graph model for the developer Flow Map tab.
//
// A FlowGraph is a normalized, render-ready view of a single content/flows/*.yaml
// survey flow: questions become nodes, the `next` field (linear id, terminal
// null, or conditional FlowGotoRule[]) becomes edges. It is derived entirely
// from the YAML the survey itself loads — there is no hand-maintained copy, so
// rebuilding the studio after editing a flow updates the map.

import type { FlowQuestionType } from "../survey/types.ts";

/** How an edge was produced from a question's `next`. */
export type EdgeKind = "linear" | "conditional" | "default";

/** A single question, flattened for rendering. */
export interface GraphNode {
  id: string;
  flowId: string;
  /** prompt ?? label ?? id — what the runner would show (or the id for notices). */
  label: string;
  type: FlowQuestionType;
  required: boolean;
  /** engine_resolved: never shown to the user; the engine evaluates its `next`. */
  engineResolved: boolean;
  advisory: boolean;
  /** First question in the flow. */
  isEntry: boolean;
  /** No outgoing edges (next is null/absent, or all branches terminate). */
  isTerminal: boolean;
  /** `next` is a conditional list — this question's answer gates where you go. */
  isGate: boolean;
  /** Count of select/radio/multi_select options (0 otherwise). */
  optionCount: number;
}

/** A directed transition between two questions. */
export interface GraphEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  /** Condition text for conditional edges, "(else)" for default branches. */
  label?: string;
  /** True when `to` does not resolve to a node in this flow. */
  dangling: boolean;
}

/** A complete, normalized flow ready for layout + rendering. */
export interface FlowGraph {
  flowId: string;
  phase: string;
  /** Friendly title for the section header. */
  title: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  entryId: string | null;
  /** goto targets that reference an unknown question id (authoring defects). */
  danglingTargets: string[];
}

// Graph model for the developer Dashboard tab.
//
// A FlowGraph is a normalized, render-ready view of a survey flow: questions
// become nodes, the `next` field (linear id, terminal null, or conditional
// FlowGotoRule[]) becomes edges. It is derived entirely from the source the
// survey runtime actually loads — there is no hand-maintained copy, so
// rebuilding the studio after editing a flow updates the map.
//
// P0 node taxonomy (kind + region):
//   kind="live"               a step the runtime runs (manifest-referenced for
//                             Phase B; legacy-YAML-resolved for A/F/identity-lite)
//   kind="library-not-in-flow"  a registered Phase B module no manifest references
//                             (§3.8 reserve); rendered distinctly as not-running
//   kind="stub"               a gallery / wizard stage with no question metadata yet
//                             (surfaced so no stage is invisible)
//
//   region="flow"             live nodes that belong to the ordered survey spine
//   region="not-yet-ordered"  library-not-in-flow AND stub nodes — neither is part
//                             of the ordered spine
//
// T031: StepGraph / StepGraphNode model for manifest-driven dashboard (C8/FR-010).
//   One node per steps/manifest.ts entry; node set == runtime step set.

import type { FlowQuestionType } from "../survey/types.ts";

// ---------------------------------------------------------------------------
// FlowGraph — survey-question-level graph (legacy + P3 modular path)
// ---------------------------------------------------------------------------

/** How an edge was produced from a question's `next`. */
export type EdgeKind = "linear" | "conditional" | "default";

/**
 * P0 node taxonomy: what kind of step this node represents.
 *   "live"                — a step the runtime runs
 *   "library-not-in-flow" — a registered module the live manifest does not reference
 *   "stub"               — a gallery or hand-built wizard stage with no question metadata
 */
export type NodeKind = "live" | "library-not-in-flow" | "stub";

/**
 * P0 region grouping: where on the map the node appears.
 *   "flow"             — belongs to the survey spine
 *   "not-yet-ordered"  — stage whose spine position is not yet derivable
 */
export type NodeRegion = "flow" | "not-yet-ordered";

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
  /**
   * P0 node kind. Existing (pre-P0) nodes default to "live".
   * "library-not-in-flow" nodes are registered Phase B modules not in the manifest.
   * "stub" nodes are galleries or wizard stages with no question metadata.
   */
  kind: NodeKind;
  /**
   * P0 region grouping. "flow" for live question nodes (ordered spine);
   * "not-yet-ordered" for library-not-in-flow reserve nodes and stubs (neither
   * is part of the ordered spine).
   */
  region: NodeRegion;
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

// ---------------------------------------------------------------------------
// StepGraph — manifest-driven model (T031, C8/FR-010)
//
// One node per steps/manifest.ts entry; node set == runtime step set.
// The dashboard reads this instead of constructing its own step ordering.
// ---------------------------------------------------------------------------

/** Node type for a step derived from steps/manifest.ts. */
export type StepNodeType = "editor-step" | "question-step";

/** A single step from the manifest, rendered as a dashboard node. */
export interface StepGraphNode {
  /** Step id (from manifest). */
  id: string;
  /** Human-readable title (from Step.title). */
  label: string;
  /** Step kind: "editor-step" (gallery/panel) or "question-step" (survey question). */
  type: StepNodeType;
  /** True when spine === true in the manifest. */
  spine: boolean;
  /** Lock gate placed after this step ("physical" | "touch" | undefined). */
  lock?: "physical" | "touch";
  /**
   * For off-spine steps: the spine step id this side trail rejoins.
   * Undefined for spine steps.
   */
  joinTarget?: string;
  /** True for the first step in the manifest. */
  isEntry: boolean;
  /** True for the last step in the manifest. */
  isTerminal: boolean;
  /**
   * Formatted IRPath strings this step writes (from Step.writes).
   * Used by completeness checks (C1, C2, C5) operating on the StepGraph.
   */
  writePaths: readonly string[];
  /**
   * Formatted IRPath strings this step reads (from Step.inputs).
   * Used by completeness checks (C1, C2, C5) operating on the StepGraph.
   */
  inputPaths: readonly string[];
}

/** A directed edge between two manifest steps. */
export interface StepGraphEdge {
  from: string;
  to: string;
  /**
   * "spine" = linear spine progression;
   * "fork"  = spine step branching to an off-spine step;
   * "join"  = off-spine step rejoining the spine at joinTarget.
   */
  kind: "spine" | "fork" | "join";
}

/**
 * A complete, normalized manifest step graph (T031, C8/FR-010).
 * One node per manifest step; edges represent the spine order + fork/join
 * edges for off-spine steps, plus data-dependency edges from writes→inputs.
 */
export interface StepGraph {
  /** All manifest steps as nodes, in manifest array order. */
  nodes: readonly StepGraphNode[];
  /** Directed order edges: spine progression + fork/join side trails. */
  edges: readonly StepGraphEdge[];
  /**
   * Directed data edges: from producer step to consumer step, where producer.writes
   * contains an IRPath matching an IRPath in consumer.inputs. Used by C1/C2/C5
   * completeness checks (staleness fixpoint, cycle detection, orphan inputs).
   */
  dataEdges: readonly StepGraphEdge[];
}

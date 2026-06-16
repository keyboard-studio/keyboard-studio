// Zero-dependency layered layout for a FlowGraph.
//
// Top-down flowchart: each node's row (rank) is its longest-path distance from
// any source, computed by edge relaxation (robust to forward-skip edges and the
// occasional back edge — capped at |V| passes so a cycle can't loop forever).
// Within a row, nodes keep their YAML declaration order (stable + readable), and
// rows are centred so downward edges stay roughly vertical. The result is pure
// geometry; FlowGraphView renders it.

import type { FlowGraph, GraphEdge, GraphNode } from "./model.ts";

export const NODE_W = 220;
export const NODE_H = 68;
const H_GAP = 36;
const V_GAP = 52;
const PAD = 24;

export interface PositionedNode extends GraphNode {
  x: number;
  y: number;
}

export interface LaidOutGraph {
  flowId: string;
  title: string;
  phase: string;
  nodes: PositionedNode[];
  edges: GraphEdge[];
  danglingTargets: string[];
  width: number;
  height: number;
}

/** Compute the row (rank) of every node by longest-path relaxation. */
function computeRanks(nodes: GraphNode[], edges: GraphEdge[]): Map<string, number> {
  const rank = new Map<string, number>();
  for (const n of nodes) rank.set(n.id, 0);

  // Only relax over edges whose endpoints both exist (skip dangling targets).
  const realEdges = edges.filter((e) => !e.dangling && rank.has(e.from) && rank.has(e.to));

  // |V| passes is enough for the longest acyclic path; the cap also bounds any
  // accidental cycle so layout always terminates.
  for (let pass = 0; pass < nodes.length; pass++) {
    let changed = false;
    for (const e of realEdges) {
      const fromRank = rank.get(e.from)!;
      const toRank = rank.get(e.to)!;
      if (toRank < fromRank + 1) {
        rank.set(e.to, fromRank + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return rank;
}

/** Position a FlowGraph as a centred top-down layered flowchart. */
export function layoutFlowGraph(graph: FlowGraph): LaidOutGraph {
  const rank = computeRanks(graph.nodes, graph.edges);

  // Group node ids by rank, preserving declaration order within each rank.
  const rows = new Map<number, GraphNode[]>();
  for (const n of graph.nodes) {
    const r = rank.get(n.id) ?? 0;
    const row = rows.get(r);
    if (row) row.push(n);
    else rows.set(r, [n]);
  }

  const maxRowLen = Math.max(1, ...[...rows.values()].map((r) => r.length));
  const contentW = maxRowLen * NODE_W + (maxRowLen - 1) * H_GAP;

  const positioned: PositionedNode[] = [];
  for (const [r, row] of rows) {
    const rowW = row.length * NODE_W + (row.length - 1) * H_GAP;
    const startX = PAD + (contentW - rowW) / 2;
    row.forEach((n, i) => {
      positioned.push({
        ...n,
        x: startX + i * (NODE_W + H_GAP),
        y: PAD + r * (NODE_H + V_GAP),
      });
    });
  }

  const maxRank = Math.max(0, ...[...rows.keys()]);
  const width = contentW + PAD * 2;
  const height = (maxRank + 1) * NODE_H + maxRank * V_GAP + PAD * 2;

  return {
    flowId: graph.flowId,
    title: graph.title,
    phase: graph.phase,
    nodes: positioned,
    edges: graph.edges,
    danglingTargets: graph.danglingTargets,
    width,
    height,
  };
}

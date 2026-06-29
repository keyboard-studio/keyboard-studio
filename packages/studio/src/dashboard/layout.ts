// Zero-dependency layered layout for a FlowGraph.
//
// Top-down flowchart: each node's row (rank) is its longest-path distance from
// any source, computed by edge relaxation on the cycle-broken DAG. Within a
// row, nodes keep their YAML declaration order (stable + readable), and rows
// are centred so downward edges stay roughly vertical. The result is pure
// geometry; FlowGraphView renders it.
//
// Cycle safety: flows such as Phase B contain intentional loop-back edges (e.g.
// pb_additional_methods → pb_text_sample). Including those edges in the
// longest-path relaxation causes a feedback loop that pumps the looping nodes'
// ranks to ≈ |V|, producing a canvas thousands of pixels tall.
// classifyBackEdges() detects back-edges with an iterative DFS (target already
// on the current DFS stack) and excludes them from rank computation. The
// iterative implementation uses an explicit stack so there is no recursion-depth
// ceiling — survey flows that grow to thousands of nodes in a long chain cannot
// overflow the JS call stack. The |V|-pass safety cap is kept as a backstop for
// any edge not caught by the DFS.

import type { FlowGraph, GraphEdge, GraphNode } from "./model.ts";

export const NODE_W = 220;
// NODE_H = 94: 68 baseline + 26 for the two metadata lines (writes/inputs) on
// manifest-step stub nodes (spec 021 FR-004). Live question nodes leave the
// extra space empty — overflow:hidden clips it, the cards just have more
// bottom padding, which is acceptable given the map is a developer tool.
export const NODE_H = 94;
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

/**
 * Classify which real (non-dangling) edges are back-edges using an iterative
 * DFS from all source nodes (nodes with no incoming real edges).
 *
 * A back-edge is one whose target is already on the current DFS stack (i.e. it
 * would create a cycle in the spanning tree). Excluding back-edges from
 * longest-path relaxation converts the multigraph into a DAG so rank
 * computation terminates in at most |V|−1 passes and reflects actual graph
 * depth rather than cycle length.
 *
 * The implementation uses an explicit stack of { id, edgeIndex } frames rather
 * than JS call-stack recursion. This means survey flows with thousands of nodes
 * in a long chain cannot overflow the JS call stack regardless of depth.
 *
 * Three-colour semantics (identical to the recursive formulation):
 *   0 (white)  — node not yet visited
 *   1 (grey)   — node is on the current DFS path (has been entered, not exited)
 *   2 (black)  — node fully explored (all descendants processed)
 * A grey target when processing an edge means the edge is a back-edge.
 *
 * Behaviour on acyclic graphs: no edge is a back-edge, so the returned set is
 * empty and computeRanks behaves identically to the pre-fix implementation.
 *
 * Two-pass strategy (same as before):
 *   Pass 1 — start from every zero-in-degree source (covers the normal case and
 *             handles disconnected components that have their own sources).
 *   Pass 2 — sweep any still-unvisited nodes (handles graphs where every node
 *             is inside a cycle with no external entry point).
 * Nodes/edges are iterated in their declaration order so results are stable
 * run-to-run.
 */
function classifyBackEdges(
  nodes: GraphNode[],
  realEdges: GraphEdge[],
): Set<GraphEdge> {
  // Build adjacency list from real edges.
  const adj = new Map<string, GraphEdge[]>();
  const inDegree = new Map<string, number>();
  for (const n of nodes) {
    adj.set(n.id, []);
    inDegree.set(n.id, 0);
  }
  for (const e of realEdges) {
    adj.get(e.from)?.push(e);
    inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1);
  }

  const backEdges = new Set<GraphEdge>();
  // "white/grey/black" DFS colouring: 0 = unvisited, 1 = on stack, 2 = done.
  const colour = new Map<string, 0 | 1 | 2>();
  for (const n of nodes) colour.set(n.id, 0);

  /**
   * Run an iterative DFS from `startId`.
   *
   * Each stack frame is { id, edgeIndex } where edgeIndex tracks how many of
   * the node's outgoing edges have already been processed. On the first push
   * (edgeIndex === 0) the node is coloured grey. When edgeIndex reaches the
   * end of the adjacency list the node is coloured black and the frame is
   * popped — matching the recursive pattern of "colour grey on entry, black on
   * return."
   */
  function iterativeDfs(startId: string): void {
    // Stack frames: [nodeId, nextEdgeIndex]
    const stack: Array<[string, number]> = [[startId, 0]];
    colour.set(startId, 1); // grey — on stack

    while (stack.length > 0) {
      // Peek at the top frame (do not pop yet — we need to resume it).
      const frame = stack[stack.length - 1]!;
      const [id, edgeIndex] = frame;
      const outEdges = adj.get(id) ?? [];

      if (edgeIndex >= outEdges.length) {
        // All edges from this node have been processed — colour it black and pop.
        colour.set(id, 2);
        stack.pop();
        continue;
      }

      // Advance the edge pointer for this frame before we potentially push a
      // new frame (so when we return to this frame we move to the next edge).
      frame[1] = edgeIndex + 1;

      const e = outEdges[edgeIndex]!;
      const c = colour.get(e.to);
      if (c === 1) {
        // Target is on the current DFS stack — this is a back-edge.
        backEdges.add(e);
      } else if (c === 0) {
        // Unvisited — push and colour grey (entering the node).
        colour.set(e.to, 1);
        stack.push([e.to, 0]);
      }
      // c === 2 means already fully explored (cross/forward edge) — not a back-edge.
    }
  }

  // Pass 1: start from every source (zero in-degree) to cover disconnected
  // subgraphs that have their own source nodes.
  for (const n of nodes) {
    if ((inDegree.get(n.id) ?? 0) === 0 && colour.get(n.id) === 0) {
      iterativeDfs(n.id);
    }
  }
  // Pass 2: sweep any remaining unvisited nodes (handles graphs where every
  // node is in a cycle with no external entry).
  for (const n of nodes) {
    if (colour.get(n.id) === 0) {
      iterativeDfs(n.id);
    }
  }

  return backEdges;
}

/**
 * Compute the row (rank) of every node by longest-path relaxation on the
 * cycle-broken DAG (back-edges excluded).
 */
function computeRanks(nodes: GraphNode[], edges: GraphEdge[]): Map<string, number> {
  const rank = new Map<string, number>();
  for (const n of nodes) rank.set(n.id, 0);

  // Only relax over edges whose endpoints both exist (skip dangling targets).
  const realEdges = edges.filter((e) => !e.dangling && rank.has(e.from) && rank.has(e.to));

  // Classify back-edges so they are excluded from rank relaxation.
  // Back-edges (e.g. pb_additional_methods → pb_text_sample in Phase B) would
  // otherwise pump the looping nodes' ranks to ≈ |V|, leaving a huge empty
  // canvas before the graph.
  const backEdges = classifyBackEdges(nodes, realEdges);
  const dagEdges = realEdges.filter((e) => !backEdges.has(e));

  // |V| passes is enough for the longest acyclic path; the cap is kept as a
  // backstop for any edge the DFS missed (should not happen, but bounds runtime).
  for (let pass = 0; pass < nodes.length; pass++) {
    let changed = false;
    for (const e of dagEdges) {
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

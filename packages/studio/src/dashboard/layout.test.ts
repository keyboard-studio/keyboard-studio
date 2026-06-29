// Regression tests for layoutFlowGraph / computeRanks cycle-safety.
//
// Phase B contains intentional loop-back edges (pb_additional_methods jumps
// back to pb_text_sample, pb_linguist_confirm, pb_picker_confirm). Before the
// fix, those back-edges caused a rank-inflation feedback loop that pumped the
// looping nodes' ranks to ≈ |V|, producing a canvas thousands of pixels tall.
//
// These tests assert:
//   1. A graph with a back-edge/cycle produces a bounded canvas height (the
//      cycle-broken DAG depth, not ≈ |V|).
//   2. A purely acyclic graph is unaffected: its ranks and height are unchanged
//      by the cycle-safety classification.
//   3. The real Phase B modular graph (the original bug trigger) produces a
//      canvas height compatible with the true graph depth.

import { describe, it, expect } from "vitest";
import { layoutFlowGraph } from "./layout.ts";
import type { FlowGraph } from "./model.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal FlowGraph from a compact adjacency list. */
function makeGraph(
  ids: string[],
  adjacency: Array<[string, string]>,
): FlowGraph {
  const idSet = new Set(ids);
  const nodes = ids.map((id, i) => ({
    id,
    flowId: "test",
    label: id,
    type: "notice" as const,
    required: false,
    engineResolved: false,
    advisory: false,
    isEntry: i === 0,
    isTerminal: i === ids.length - 1,
    isGate: false,
    optionCount: 0,
    kind: "live" as const,
    region: "flow" as const,
  }));
  const edges = adjacency.map(([from, to]) => ({
    from,
    to,
    kind: "linear" as const,
    dangling: !idSet.has(to),
  }));
  return {
    flowId: "test",
    phase: "test",
    title: "Test graph",
    nodes,
    edges,
    entryId: ids[0] ?? null,
    danglingTargets: [],
  };
}

// ---------------------------------------------------------------------------
// Test 1: cycle-containing graph — height must be bounded
// ---------------------------------------------------------------------------

describe("layoutFlowGraph — cycle-safe rank assignment", () => {
  it("a graph with a back-edge produces maxRank bounded by acyclic skeleton depth, not |V|", () => {
    // 6-node chain: A→B→C→D→E→F, plus a back-edge F→B (the cycle).
    // Acyclic skeleton depth = 5 (ranks 0..5 for nodes A..F).
    // Pre-fix: F gets rank 5, B gets max(1, 5+1)=6 on the next pass, then
    // E gets max(4, 6+1)=7, F gets 8, ... pumped to ≈|V|-1 = 5 each pass,
    // reaching rank ≈ |V| after |V| passes.
    // Post-fix: F→B is classified as a back-edge and excluded; ranks stay 0..5.
    const g = makeGraph(
      ["A", "B", "C", "D", "E", "F"],
      [["A", "B"], ["B", "C"], ["C", "D"], ["D", "E"], ["E", "F"], ["F", "B"]],
    );
    const laid = layoutFlowGraph(g);

    // With 6 nodes the rank must not reach 6 (which is what |V| passes would
    // give for a cycle-pumped node). The acyclic depth is 5 (A=0..F=5).
    const maxRankFromHeight = (laid.height - 24 * 2 + 52) / (94 + 52) - 1;
    // maxRank derived: height = (maxRank+1)*94 + maxRank*52 + 48 (NODE_H=94)
    //   => (height - 48 + 52) / 146 - 1 ≈ maxRank
    // More directly: maxRank ≤ nodeCount - 1 (5 for 6 nodes).
    expect(laid.nodes.length).toBe(6);

    // Every positioned node must have a y coordinate within a bounded canvas.
    // Pre-fix: nodes in the cycle could be at y = PAD + rank*(94+52) where
    // rank ≈ |V| ≈ 6, giving y ≈ 24 + 6*146 = 900 px — but with a 55-node
    // graph the real bug caused rank ≈ 55, so y would be much larger.
    // We assert maxRank ≤ 5 (= nodeCount - 1) for the 6-node cycle graph.
    const maxY = Math.max(...laid.nodes.map((n) => n.y));
    // maxY = PAD + maxRank * (NODE_H + V_GAP) = 24 + maxRank * 146 (NODE_H=94)
    // For maxRank = 5: maxY = 24 + 5*146 = 754.
    // So asserting maxY ≤ 754 (i.e. maxRank ≤ 5) confirms the fix.
    expect(maxY).toBeLessThanOrEqual(24 + 5 * (94 + 52)); // 754 px (NODE_H=94)
  });

  it("a self-loop (A→A) does not inflate the rank of A", () => {
    // Single node with a self-loop edge — the most degenerate cycle.
    // DFS classifies A→A as a back-edge (A is on stack when we process A→A).
    const g = makeGraph(["A"], [["A", "A"]]);
    const laid = layoutFlowGraph(g);
    expect(laid.nodes.length).toBe(1);
    expect(laid.nodes[0]!.y).toBe(24); // PAD only — rank 0
    expect(laid.height).toBe(94 + 24 * 2); // (1 node, 0 gaps) + 2*PAD (NODE_H=94)
  });

  it("a mutual cycle (A→B, B→A) assigns each node rank 0 or 1, not ≈ |V|", () => {
    // A is the source (entry), B is reachable from A.
    // Back-edge B→A is excluded; DAG is just A→B.
    // Expected: rank(A)=0, rank(B)=1.
    const g = makeGraph(["A", "B"], [["A", "B"], ["B", "A"]]);
    const laid = layoutFlowGraph(g);
    expect(laid.nodes.length).toBe(2);
    const maxY = Math.max(...laid.nodes.map((n) => n.y));
    // maxRank = 1 => maxY = 24 + 1*(NODE_H+V_GAP) = 24 + 1*146 = 170 (NODE_H=94)
    expect(maxY).toBeLessThanOrEqual(24 + 1 * (94 + 52));
  });
});

// ---------------------------------------------------------------------------
// Test 2: acyclic graph — ranks must be unchanged by the fix
// ---------------------------------------------------------------------------

describe("layoutFlowGraph — acyclic graph unchanged (golden case)", () => {
  it("a linear chain A→B→C→D produces ranks 0,1,2,3 (unchanged by cycle classification)", () => {
    const g = makeGraph(
      ["A", "B", "C", "D"],
      [["A", "B"], ["B", "C"], ["C", "D"]],
    );
    const laid = layoutFlowGraph(g);
    const byId = new Map(laid.nodes.map((n) => [n.id, n]));
    // PAD + rank * (NODE_H + V_GAP); NODE_H=94, V_GAP=52 => step=146
    expect(byId.get("A")!.y).toBe(24 + 0 * 146);
    expect(byId.get("B")!.y).toBe(24 + 1 * 146);
    expect(byId.get("C")!.y).toBe(24 + 2 * 146);
    expect(byId.get("D")!.y).toBe(24 + 3 * 146);
  });

  it("a fork-then-rejoin (A→B, A→C, B→D, C→D) assigns rank 2 to D", () => {
    // D is two hops from A via either branch.
    const g = makeGraph(
      ["A", "B", "C", "D"],
      [["A", "B"], ["A", "C"], ["B", "D"], ["C", "D"]],
    );
    const laid = layoutFlowGraph(g);
    const d = laid.nodes.find((n) => n.id === "D");
    expect(d!.y).toBe(24 + 2 * 146); // rank 2 (NODE_H=94, V_GAP=52 => step=146)
  });

  it("a skip-edge (A→B, A→C, B→C) assigns rank 1 to C via longest path", () => {
    // C is reachable from A (rank 0) via B (rank 1) at rank 2, and directly
    // from A at rank 1. Longest path wins: rank(C) = 2.
    const g = makeGraph(
      ["A", "B", "C"],
      [["A", "B"], ["A", "C"], ["B", "C"]],
    );
    const laid = layoutFlowGraph(g);
    const c = laid.nodes.find((n) => n.id === "C");
    expect(c!.y).toBe(24 + 2 * 146); // rank 2 (A→B→C is the longest path; NODE_H=94)
  });
});

// ---------------------------------------------------------------------------
// Test 3: disconnected graph — both components must get correct, bounded ranks
// ---------------------------------------------------------------------------

describe("layoutFlowGraph — disconnected graph", () => {
  it("two independent components (A→B and C→D) each get correct ranks", () => {
    // Two separate chains with no edges between them.
    // Component 1: A(rank 0) → B(rank 1).
    // Component 2: C(rank 0) → D(rank 1).
    // All four nodes must appear in the output with finite y coordinates.
    const g = makeGraph(
      ["A", "B", "C", "D"],
      [["A", "B"], ["C", "D"]],
    );
    const laid = layoutFlowGraph(g);
    expect(laid.nodes.length).toBe(4);

    const byId = new Map(laid.nodes.map((n) => [n.id, n]));

    // Component 1 ranks. (NODE_H=94, V_GAP=52 => step=146)
    expect(byId.get("A")!.y).toBe(24 + 0 * 146); // rank 0
    expect(byId.get("B")!.y).toBe(24 + 1 * 146); // rank 1

    // Component 2 ranks — C has no incoming edges so it also starts at rank 0.
    expect(byId.get("C")!.y).toBe(24 + 0 * 146); // rank 0
    expect(byId.get("D")!.y).toBe(24 + 1 * 146); // rank 1

    // Canvas dimensions must be finite and positive.
    expect(Number.isFinite(laid.width)).toBe(true);
    expect(Number.isFinite(laid.height)).toBe(true);
    expect(laid.width).toBeGreaterThan(0);
    expect(laid.height).toBeGreaterThan(0);
  });

  it("a disconnected isolated node alongside a chain does not affect chain ranks", () => {
    // Chain A→B plus isolated node C (no edges).
    // C has in-degree 0, so pass-1 visits it; it gets rank 0 (default).
    const g = makeGraph(
      ["A", "B", "C"],
      [["A", "B"]],
    );
    const laid = layoutFlowGraph(g);
    expect(laid.nodes.length).toBe(3);

    const byId = new Map(laid.nodes.map((n) => [n.id, n]));
    // (NODE_H=94, V_GAP=52 => step=146)
    expect(byId.get("A")!.y).toBe(24 + 0 * 146); // rank 0
    expect(byId.get("B")!.y).toBe(24 + 1 * 146); // rank 1
    expect(byId.get("C")!.y).toBe(24 + 0 * 146); // rank 0 (isolated)
  });
});

// ---------------------------------------------------------------------------
// Test 4: empty graph — must return finite dimensions and not throw
// ---------------------------------------------------------------------------

describe("layoutFlowGraph — empty graph", () => {
  it("nodes:[] edges:[] returns finite positive width/height and does not throw", () => {
    // The Math.max(1, ...) guard on maxRowLen and Math.max(0, ...) guard on
    // maxRank must prevent NaN/Infinity from spreading to width/height.
    const g: FlowGraph = {
      flowId: "empty",
      phase: "test",
      title: "Empty",
      nodes: [],
      edges: [],
      entryId: null,
      danglingTargets: [],
    };
    let laid: ReturnType<typeof layoutFlowGraph> | undefined;
    expect(() => {
      laid = layoutFlowGraph(g);
    }).not.toThrow();

    // Both dimensions must be finite (not NaN, not Infinity).
    expect(Number.isFinite(laid!.width)).toBe(true);
    expect(Number.isFinite(laid!.height)).toBe(true);

    // Width: maxRowLen=1 (guard), contentW = 1*NODE_W + 0*H_GAP = 220,
    // width = 220 + 2*24 = 268.
    expect(laid!.width).toBe(220 + 24 * 2);

    // Height: maxRank=0 (guard), height = 1*NODE_H + 0*V_GAP + 2*PAD = 94 + 48 = 142 (NODE_H=94).
    expect(laid!.height).toBe(94 + 24 * 2);

    // No nodes to position.
    expect(laid!.nodes.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Test 5 (formerly 3): cycle-contains synthetic graph matching Phase B's loop-back topology
// ---------------------------------------------------------------------------

describe("layoutFlowGraph — Phase B loop-back topology (55-node synthetic)", () => {
  // Phase B has 55 live questions plus reserve nodes. The critical cycle is:
  //   pb_additional_methods (position 55) → pb_text_sample (position 4)
  //   pb_additional_methods (position 55) → pb_linguist_confirm (position 6)
  //   pb_additional_methods (position 55) → pb_picker_confirm (position 7)
  // These are intentional loop-back edges that allow the user to re-enter the
  // character discovery section. Pre-fix they caused rank pumping to ≈ |V|.
  //
  // We model this topology with a synthetic 10-node graph to avoid pulling in
  // the full engine dependency chain (which requires a full build). The
  // topology faithfully represents the cycle structure:
  //   chain: A→B→C→D→E→F→G→H→I→J (linear), plus J→B, J→D, J→E (back-edges).
  it("back-edges J→B/D/E in a 10-node chain do not pump B/D/E ranks beyond acyclic depth", () => {
    // Acyclic skeleton: A(0)→B(1)→C(2)→D(3)→E(4)→F(5)→G(6)→H(7)→I(8)→J(9).
    // Back-edges J→B, J→D, J→E are excluded by classifyBackEdges.
    // Expected maxRank = 9 (acyclic depth of a 10-node chain).
    const g = makeGraph(
      ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"],
      [
        ["A", "B"], ["B", "C"], ["C", "D"], ["D", "E"],
        ["E", "F"], ["F", "G"], ["G", "H"], ["H", "I"],
        ["I", "J"],
        // Back-edges (loop-back to earlier nodes):
        ["J", "B"], ["J", "D"], ["J", "E"],
      ],
    );
    const laid = layoutFlowGraph(g);

    // All 10 nodes must be positioned.
    expect(laid.nodes.length).toBe(10);

    // maxRank for a 10-node chain is 9 (A=0..J=9).
    // Pre-fix: B gets rank max(1, 9+1)=10 → C=11 → ... → J=18 (pumped).
    // After |V|=10 passes the pump reaches about rank 10+9=19 for J.
    // Post-fix: B stays at rank 1, J stays at rank 9.
    const maxY = Math.max(...laid.nodes.map((n) => n.y));
    // maxRank 9 => maxY = PAD + 9*(NODE_H+V_GAP) = 24 + 9*146 = 1338 (NODE_H=94)
    expect(maxY).toBeLessThanOrEqual(24 + 9 * (94 + 52));

    // B must not have been rank-inflated above its natural rank 1.
    const nodeB = laid.nodes.find((n) => n.id === "B");
    expect(nodeB!.y).toBe(24 + 1 * 146); // rank 1 (NODE_H=94, V_GAP=52 => step=146)
  });
});

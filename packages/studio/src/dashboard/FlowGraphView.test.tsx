// Behaviour test: FlowGraphView renders every node in FULL.
//
// A deep phase (e.g. Phase B, ~55 questions) must render fully inline so the
// whole flow is visible on the Flow Map. There is NO node-capping / "Show more"
// collapse (an earlier collapse affordance was removed because it clipped Phase B).
// These tests pin that contract via the real layout (no mocking).

import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { FlowGraphView } from "./FlowGraphView.tsx";
import type { FlowGraph, GraphNode, GraphEdge } from "./model.ts";

function renderGraph(graph: FlowGraph) {
  return render(<FlowGraphView graph={graph} />);
}

afterEach(cleanup);

/** A live question node with sensible defaults; override as needed. */
function node(id: string, over: Partial<GraphNode> = {}): GraphNode {
  return {
    id,
    flowId: "test_flow",
    label: id,
    type: "text",
    required: false,
    engineResolved: false,
    advisory: false,
    isEntry: false,
    isTerminal: false,
    isGate: false,
    optionCount: 0,
    kind: "live",
    region: "flow",
    ...over,
  };
}

/** Build a linear-chain FlowGraph of `n` nodes (ranks 0..n-1). */
function chainGraph(n: number): FlowGraph {
  const nodes: GraphNode[] = Array.from({ length: n }, (_, i) =>
    node(`q${i}`, { isEntry: i === 0, isTerminal: i === n - 1 }),
  );
  const edges: GraphEdge[] = Array.from({ length: n - 1 }, (_, i) => ({
    from: `q${i}`,
    to: `q${i + 1}`,
    kind: "linear" as const,
    dangling: false,
  }));
  return {
    flowId: "test_flow",
    phase: "B",
    title: "Test flow",
    nodes,
    edges,
    entryId: n > 0 ? "q0" : null,
    danglingTargets: [],
  };
}

/** True when some rendered element carries the (removed) collapsed cap. */
function hasCollapsedCap(container: HTMLElement): boolean {
  return [...container.querySelectorAll<HTMLElement>("div")].some(
    (el) => el.style.maxHeight === "520px",
  );
}

describe("FlowGraphView — full render (no collapse)", () => {
  it("a tall graph renders every node, with no Show more/less toggle and no height cap", () => {
    const { container } = renderGraph(chainGraph(8));
    // No collapse affordance.
    expect(
      screen.queryByRole("button", { name: /show more|show less/i }),
    ).toBeNull();
    expect(hasCollapsedCap(container)).toBe(false);
    // Every node id is present in the DOM (nothing cut off).
    for (let i = 0; i < 8; i++) {
      expect(screen.getAllByText(`q${i}`).length).toBeGreaterThan(0);
    }
  });

  it("a short graph also renders fully with no toggle", () => {
    renderGraph(chainGraph(3));
    expect(
      screen.queryByRole("button", { name: /show more|show less/i }),
    ).toBeNull();
    for (let i = 0; i < 3; i++) {
      expect(screen.getAllByText(`q${i}`).length).toBeGreaterThan(0);
    }
  });
});

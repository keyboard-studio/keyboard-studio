// FR-024 identity test: the flow map with NO overlay renders exactly as it did
// before this feature existed (specs/053-decision-audit T040; trail-ui.contract.md §5).
//
// WHY A SNAPSHOT, AND WHY THIS ONE
//
// FR-024 is an identity, not a similarity: "with no keyboard selected, the flow map
// MUST behave exactly as it does today". A test that merely asserted the overlay
// testid is absent would pass while the overlay silently restyled every node card.
// So the no-overlay render is pinned byte-for-byte as `container.innerHTML`.
//
// The committed snapshot was generated against FlowGraphView BEFORE the overlay
// prop existed, and the overlay implementation had to leave it untouched. That
// ordering is what makes it evidence rather than a description: regenerating it
// after a regression would erase the only record of the pre-feature render, so if
// this test fails, the fix belongs in the component, NOT in `-u`.
//
// The second block is the other half — with an overlay present, walked steps and
// edges must actually be distinguishable, or the identity above is only proving
// that a no-op is a no-op.

import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent } from "@testing-library/react";
import type { DecisionImpact } from "@keyboard-studio/contracts";
import { render } from "../test/renderWithI18n.tsx";
import { FlowGraphView } from "./FlowGraphView.tsx";
import type { PathOverlay } from "./pathOverlay.ts";
import type { FlowGraph, GraphNode, GraphEdge } from "./model.ts";

afterEach(cleanup);

/** A live question node with sensible defaults; override as needed. */
function node(id: string, over: Partial<GraphNode> = {}): GraphNode {
  return {
    id,
    flowId: "overlay_flow",
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

/** A three-node linear chain: s0 -> s1 -> s2. */
function chainGraph(): FlowGraph {
  const ids = ["s0", "s1", "s2"];
  const nodes: GraphNode[] = ids.map((id, i) =>
    node(id, { isEntry: i === 0, isTerminal: i === ids.length - 1 }),
  );
  const edges: GraphEdge[] = [
    { from: "s0", to: "s1", kind: "linear", dangling: false },
    { from: "s1", to: "s2", kind: "linear", dangling: false },
  ];
  return {
    flowId: "overlay_flow",
    phase: "B",
    title: "Overlay test flow",
    nodes,
    edges,
    entryId: "s0",
    danglingTargets: [],
  };
}

/** s0 -> s1 walked; s2 never reached. */
function overlay(): PathOverlay {
  return {
    walkedSteps: new Set(["s0", "s1"]),
    walkedEdges: new Set(["s0->s1"]),
  };
}

/**
 * A graph exercising branches the three-node linear `chainGraph` above does
 * not: a `lock` gate, a `kind:"stub"` node, and `writePaths`/`inputPaths`
 * metadata. `chainGraph` alone only pins the entry/terminal/no-metadata path,
 * so a regression in these other branches would not be caught by the
 * `toMatchSnapshot` above (km-frontend FR-024 caveat).
 */
function metadataGraph(): FlowGraph {
  const nodes: GraphNode[] = [
    node("m0", {
      isEntry: true,
      kind: "stub",
      region: "not-yet-ordered",
      stepKind: "editor-step",
      writePaths: ["ir.chars"],
      inputPaths: [],
    }),
    node("m1", {
      stepKind: "question-step",
      writePaths: ["ir.layers.touch"],
      inputPaths: ["ir.chars"],
      lock: "physical",
    }),
    node("m2", {
      isTerminal: true,
      stepKind: "editor-step",
      writePaths: [],
      inputPaths: ["ir.layers.touch"],
    }),
  ];
  const edges: GraphEdge[] = [
    { from: "m0", to: "m1", kind: "linear", dangling: false },
    { from: "m1", to: "m2", kind: "linear", dangling: false },
  ];
  return {
    flowId: "overlay_flow",
    phase: "B",
    title: "Metadata coverage flow",
    nodes,
    edges,
    entryId: "m0",
    danglingTargets: [],
  };
}

describe("FR-024 — no overlay means no change at all", () => {
  it("renders no overlay layer when the prop is absent", () => {
    render(<FlowGraphView graph={chainGraph()} />);
    expect(screen.queryByTestId("flowmap-path-overlay")).toBeNull();
  });

  it("renders markup identical to the pre-overlay build", () => {
    const { container } = render(<FlowGraphView graph={chainGraph()} />);
    // Pinned against the pre-feature component — see the module header before
    // reaching for `vitest -u`.
    expect(container.innerHTML).toMatchSnapshot();
  });

  it("renders markup identical to the pre-overlay build for lock/stub/metadata nodes", () => {
    // A SEPARATE snapshot, not a re-generation of the one above: that snapshot
    // stays evidence of the pre-overlay render for the plain linear case, and
    // this one extends coverage to the branches it never exercised.
    const { container } = render(<FlowGraphView graph={metadataGraph()} />);
    expect(container.innerHTML).toMatchSnapshot();
  });

  it("an explicitly undefined overlay is the same as an absent one", () => {
    const { container: withoutProp } = render(<FlowGraphView graph={chainGraph()} />);
    const absent = withoutProp.innerHTML;
    cleanup();
    const { container: withUndefined } = render(
      <FlowGraphView graph={chainGraph()} pathOverlay={undefined} />,
    );
    expect(withUndefined.innerHTML).toBe(absent);
  });
});

describe("FR-023 — an overlay distinguishes the walked path", () => {
  it("mounts the overlay layer when the prop is present", () => {
    render(<FlowGraphView graph={chainGraph()} pathOverlay={overlay()} />);
    expect(screen.getByTestId("flowmap-path-overlay")).toBeTruthy();
  });

  it("marks walked steps and leaves untraversed ones unmarked", () => {
    render(<FlowGraphView graph={chainGraph()} pathOverlay={overlay()} />);
    const layer = screen.getByTestId("flowmap-path-overlay");
    const walked = [...layer.querySelectorAll("[data-walked-step]")].map((el) =>
      el.getAttribute("data-walked-step"),
    );
    expect(walked).toEqual(["s0", "s1"]);
    expect(walked).not.toContain("s2");
  });

  it("marks the walked edge and leaves the untraversed edge unmarked", () => {
    render(<FlowGraphView graph={chainGraph()} pathOverlay={overlay()} />);
    const layer = screen.getByTestId("flowmap-path-overlay");
    const walked = [...layer.querySelectorAll("[data-walked-edge]")].map((el) =>
      el.getAttribute("data-walked-edge"),
    );
    expect(walked).toEqual(["s0->s1"]);
  });

  it("does not add the alternative affordance just because an overlay is present", () => {
    // The two props are independent: a read-only overlay must not imply a
    // counterfactual seam.
    render(<FlowGraphView graph={chainGraph()} pathOverlay={overlay()} />);
    expect(screen.queryByTestId("flowmap-alternative-open")).toBeNull();
  });

  it("decorates nothing when the record walked steps this graph does not contain", () => {
    // A record from a different flow must not invent decoration — the overlay is a
    // projection over the graph it is handed, never a second source of nodes.
    render(
      <FlowGraphView
        graph={chainGraph()}
        pathOverlay={{ walkedSteps: new Set(["elsewhere"]), walkedEdges: new Set(["a->b"]) }}
      />,
    );
    const layer = screen.getByTestId("flowmap-path-overlay");
    expect(layer.querySelectorAll("[data-walked-step]")).toHaveLength(0);
    expect(layer.querySelectorAll("[data-walked-edge]")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// FR-026 / FR-027 / FR-028 — the one-branch-deep alternative
// ---------------------------------------------------------------------------

const CAPTURED: DecisionImpact = {
  state: "captured",
  files: [
    {
      path: "source/hausa_std.kmn",
      hunks: [{ oldStart: 4, oldLines: 1, newStart: 4, newLines: 1, lines: ["-+ [K_A] > 'a'", "++ [K_A] > 'ɓ'"] }],
      magnitude: { added: 1, removed: 1 },
    },
  ],
  magnitude: { added: 1, removed: 1 },
};

/** Open s1's panel and type an alternative answer. */
function openAlternative(stepId: string, value: string) {
  const open = screen
    .getAllByTestId("flowmap-alternative-open")
    .find((el) => el.getAttribute("data-step-id") === stepId);
  fireEvent.click(open!);
  fireEvent.change(screen.getByTestId("flowmap-alternative-value"), { target: { value } });
}

describe("FR-026 — an alternative answer at one inspected node", () => {
  it("derives nothing until it is asked (FR-027)", () => {
    const resolveAlternative = vi.fn(() => CAPTURED);
    render(<FlowGraphView graph={chainGraph()} resolveAlternative={resolveAlternative} />);
    // Mounting, inspecting, and typing are all free of derivation.
    openAlternative("s1", "ɓ");
    expect(resolveAlternative).not.toHaveBeenCalled();
    expect(screen.getByTestId("flowmap-alternative")).toBeTruthy();
  });

  it("derives for the inspected node ONLY, and once per request", () => {
    const resolveAlternative = vi.fn(() => CAPTURED);
    render(<FlowGraphView graph={chainGraph()} resolveAlternative={resolveAlternative} />);
    openAlternative("s1", "ɓ");
    fireEvent.click(screen.getByTestId("flowmap-alternative-derive"));

    expect(resolveAlternative).toHaveBeenCalledTimes(1);
    expect(resolveAlternative).toHaveBeenCalledWith("s1", "ɓ");
    // The outcome is the requested node's diff.
    expect(screen.getByTestId("flowmap-alternative-outcome").textContent).toContain("[K_A]");
  });

  it("shows structural information for the inspected node before any request", () => {
    render(<FlowGraphView graph={chainGraph()} resolveAlternative={() => CAPTURED} />);
    openAlternative("s2", "x");
    const panel = screen.getByTestId("flowmap-alternative");
    expect(panel.textContent).toContain("s2");
    expect(panel.textContent).toContain("writes:");
    expect(panel.textContent).toContain("inputs:");
  });

  it("drops a derived outcome when a different node is inspected", () => {
    render(<FlowGraphView graph={chainGraph()} resolveAlternative={() => CAPTURED} />);
    openAlternative("s1", "ɓ");
    fireEvent.click(screen.getByTestId("flowmap-alternative-derive"));
    expect(screen.getByTestId("flowmap-alternative-outcome").textContent).toContain("[K_A]");

    // Selecting another node must not carry s1's answer over as if it were s2's.
    const open = screen
      .getAllByTestId("flowmap-alternative-open")
      .find((el) => el.getAttribute("data-step-id") === "s2");
    fireEvent.click(open!);
    expect(screen.getByTestId("flowmap-alternative-outcome").textContent).not.toContain("[K_A]");
  });
});

describe("FR-028 — an underivable alternative is a sentence, not a failure", () => {
  it("states the reason when the write path cannot be re-derived", () => {
    render(
      <FlowGraphView
        graph={chainGraph()}
        resolveAlternative={() => ({
          state: "unavailable",
          reason: "no-rederivable-write-path",
        })}
      />,
    );
    openAlternative("s1", "ɓ");
    fireEvent.click(screen.getByTestId("flowmap-alternative-derive"));
    expect(screen.getByTestId("flowmap-alternative-outcome").textContent).toContain(
      "no re-derivable write path",
    );
  });

  it("states the reason when a lock gate has already closed", () => {
    render(
      <FlowGraphView
        graph={chainGraph()}
        resolveAlternative={() => ({ state: "unavailable", reason: "lock-gate-dependency" })}
      />,
    );
    openAlternative("s1", "ɓ");
    fireEvent.click(screen.getByTestId("flowmap-alternative-derive"));
    expect(screen.getByTestId("flowmap-alternative-outcome").textContent).toContain("lock");
  });

  it("says so when the step recorded no decision to vary", () => {
    render(<FlowGraphView graph={chainGraph()} resolveAlternative={() => null} />);
    openAlternative("s1", "ɓ");
    fireEvent.click(screen.getByTestId("flowmap-alternative-derive"));
    expect(screen.getByTestId("flowmap-alternative-outcome").textContent).toContain(
      "No decision was recorded",
    );
  });

  it("reports a decision that would change nothing as a positive statement", () => {
    render(<FlowGraphView graph={chainGraph()} resolveAlternative={() => ({ state: "none" })} />);
    openAlternative("s1", "ɓ");
    fireEvent.click(screen.getByTestId("flowmap-alternative-derive"));
    expect(screen.getByTestId("flowmap-alternative-outcome").textContent).toContain(
      "change nothing",
    );
  });
});

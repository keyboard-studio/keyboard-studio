// Render test for FlowGraphView: asserts the outer container div carries the
// CSS cap that prevents a tall graph (e.g. Phase B, ~3,956 px) from pushing
// the next section far below the viewport.
//
// P1 guard: deleting `maxHeight: FLOW_GRAPH_MAX_HEIGHT` from FlowGraphView.tsx
// would leave the outer div without a maxHeight style, causing this test to
// fail on the `style.maxHeight` assertion.

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { FlowGraphView } from "./FlowGraphView.tsx";
import { FLOW_GRAPH_MAX_HEIGHT } from "./layout.ts";
import type { FlowGraph } from "./model.ts";

afterEach(cleanup);

/** Minimal 3-node linear FlowGraph fixture. The test only inspects the outer
 *  container style, so graph content (node count, edges) is incidental. */
const minimalGraph: FlowGraph = {
  flowId: "test-flow",
  phase: "test",
  title: "Test flow",
  entryId: "n0",
  danglingTargets: [],
  nodes: [
    {
      id: "n0",
      flowId: "test-flow",
      label: "Start",
      type: "notice",
      required: false,
      engineResolved: false,
      advisory: false,
      isEntry: true,
      isTerminal: false,
      isGate: false,
      optionCount: 0,
      kind: "live",
      region: "flow",
    },
    {
      id: "n1",
      flowId: "test-flow",
      label: "Middle",
      type: "notice",
      required: false,
      engineResolved: false,
      advisory: false,
      isEntry: false,
      isTerminal: false,
      isGate: false,
      optionCount: 0,
      kind: "live",
      region: "flow",
    },
    {
      id: "n2",
      flowId: "test-flow",
      label: "End",
      type: "notice",
      required: false,
      engineResolved: false,
      advisory: false,
      isEntry: false,
      isTerminal: true,
      isGate: false,
      optionCount: 0,
      kind: "live",
      region: "flow",
    },
  ],
  edges: [
    { from: "n0", to: "n1", kind: "linear", dangling: false },
    { from: "n1", to: "n2", kind: "linear", dangling: false },
  ],
};

describe("FlowGraphView — outer container CSS cap", () => {
  it("outer div has maxHeight set to FLOW_GRAPH_MAX_HEIGHT px and overflow auto", () => {
    const { container } = render(<FlowGraphView graph={minimalGraph} />);

    // The outermost div is the scroll container that carries the CSS cap.
    const outer = container.firstElementChild as HTMLElement;
    expect(outer).not.toBeNull();

    // maxHeight must be the constant (currently 600) expressed as a px string.
    // If maxHeight were removed from FlowGraphView.tsx, outer.style.maxHeight
    // would be "" and this assertion would fail.
    expect(outer.style.maxHeight).toBe(`${FLOW_GRAPH_MAX_HEIGHT}px`);

    // overflow must be "auto" so the panel is scrollable, not clipped.
    // If overflow were removed or set to "hidden", this assertion would fail.
    expect(outer.style.overflow).toBe("auto");
  });
});

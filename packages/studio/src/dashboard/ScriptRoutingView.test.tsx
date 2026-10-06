// ScriptRoutingView narrow-viewport tests (mobile adaptation, Phase 5).
//
// The 4-column table is too dense for 390px: narrow viewports render each
// row as a stacked card instead. Desktop keeps the table unchanged.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, cleanup, act } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { ScriptRoutingView } from "./ScriptRoutingView.tsx";
import type { FlowDef } from "../survey/types.ts";

vi.mock("./buildScriptRouting.ts", () => ({
  buildScriptRouting: () => [
    {
      value: "latin",
      label: "Latin",
      script: "Latn",
      scriptClass: "alphabetic",
      routingGroup: "qwerty-qwertz",
      gated: false,
    },
    {
      value: "arabic",
      label: "Arabic",
      script: "Arab",
      scriptClass: "abjad",
      routingGroup: "non-roman",
      gated: false,
    },
  ],
}));

// buildScriptRouting is mocked, so the flow's contents are never read.
const EMPTY_FLOW: FlowDef = { flow_id: "identity_lite", phase: "A", questions: [] };

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: height, configurable: true });
  act(() => {
    window.dispatchEvent(new Event("resize"));
  });
}

beforeEach(() => {
  setViewport(1280, 800);
});

afterEach(() => {
  cleanup();
  setViewport(1280, 800);
});

describe("ScriptRoutingView — narrow viewport", () => {
  it("renders cards instead of the table at 390px", () => {
    setViewport(390, 844);
    render(<ScriptRoutingView flow={EMPTY_FLOW} />);

    expect(screen.queryByRole("table")).toBeNull();
    // Card labels carry the field names.
    expect(screen.getAllByText(/Normalized:/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/A2 class:/).length).toBeGreaterThan(0);
  });

  it("keeps the table at 1280px", () => {
    setViewport(1280, 800);
    render(<ScriptRoutingView flow={EMPTY_FLOW} />);

    expect(screen.getByRole("table")).not.toBeNull();
    expect(screen.queryByText(/Normalized:/)).toBeNull();
  });
});

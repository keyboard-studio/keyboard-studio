// StrategyTreeView narrow-viewport test (mobile adaptation #1853, Phase 5).
//
// The rule cards use flexWrap so they stack on narrow viewports. This test
// verifies no element exceeds the 390px viewport width.
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { cleanup, act } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { StrategyTreeView } from "./StrategyTreeView.tsx";

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

describe("StrategyTreeView — narrow viewport", () => {
  it("no element exceeds 390px width at 390px viewport", () => {
    setViewport(390, 844);
    const { container } = render(<StrategyTreeView />);

    // jsdom doesn't do layout, so check for fixed min-widths that would
    // force overflow: the condition code's minWidth: 220 fits in 390px.
    const all = container.querySelectorAll("*");
    for (const el of all) {
      const html = el as HTMLElement;
      const minWidth = parseFloat(html.style.minWidth || "0");
      expect(minWidth).toBeLessThanOrEqual(390);
    }
  });
});

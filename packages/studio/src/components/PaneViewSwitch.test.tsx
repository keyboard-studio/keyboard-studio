// PaneViewSwitch tests (mobile adaptation, Phase 2).
//
// The switch self-gates on `useIsNarrow()`: null on desktop viewports, the
// Questions | Preview segmented control on narrow ones. Viewport width is
// stubbed per-test via `window.innerWidth` (the geometry path needs no
// matchMedia stub — see useViewport.ts's fallback) and restored afterwards.
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { PaneViewSwitch } from "./PaneViewSwitch.tsx";

const DESKTOP_WIDTH = 1024;
const NARROW_WIDTH = 390;

function setViewportWidth(width: number): void {
  Object.defineProperty(window, "innerWidth", {
    value: width,
    configurable: true,
  });
}

describe("PaneViewSwitch", () => {
  afterEach(() => {
    cleanup();
    setViewportWidth(DESKTOP_WIDTH);
  });

  it("renders nothing on desktop viewports", () => {
    setViewportWidth(DESKTOP_WIDTH);
    render(<PaneViewSwitch value="questions" onChange={() => {}} />);
    expect(
      screen.queryByRole("group", { name: "Survey pane view" }),
    ).toBeNull();
  });

  it("renders Questions and Preview options on narrow viewports", () => {
    setViewportWidth(NARROW_WIDTH);
    render(<PaneViewSwitch value="questions" onChange={() => {}} />);
    const group = screen.getByRole("group", { name: "Survey pane view" });
    expect(group).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Questions", pressed: true }),
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Preview", pressed: false }),
    ).not.toBeNull();
  });

  it("marks the active option with aria-pressed", () => {
    setViewportWidth(NARROW_WIDTH);
    render(<PaneViewSwitch value="preview" onChange={() => {}} />);
    expect(
      screen.getByRole("button", { name: "Questions", pressed: false }),
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Preview", pressed: true }),
    ).not.toBeNull();
  });

  it("fires onChange with the tapped option", () => {
    setViewportWidth(NARROW_WIDTH);
    const onChange = vi.fn();
    render(<PaneViewSwitch value="questions" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("preview");
  });
});

// AssignLoopShell narrow-viewport tests (mobile adaptation #1853, Phase 4).
//
// Contract:
//   - desktop: the two-pane row renders leftContent + rightContent inline;
//     no preview trigger, no sheet;
//   - narrow with rightContent: leftContent fills the surface, rightContent
//     is NOT mounted (sheet closed — principle 9), a "Show keyboard preview"
//     trigger opens the sheet with rightContent inside;
//   - narrow without rightContent: no trigger, no sheet (the T033 collapse
//     seam, reused).
//
// Viewport width is stubbed via `window.innerWidth` (geometry path needs no
// matchMedia stub — see useViewport.ts's fallback).
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { screen, cleanup, fireEvent, act } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { AssignLoopShell } from "./AssignLoopShell.tsx";

function setViewportWidth(width: number): void {
  Object.defineProperty(window, "innerWidth", {
    value: width,
    configurable: true,
  });
  act(() => {
    window.dispatchEvent(new Event("resize"));
  });
}

beforeEach(() => {
  setViewportWidth(1280);
});

afterEach(() => {
  cleanup();
  setViewportWidth(1280);
});

function renderShell(rightContent: React.ReactNode = <div data-testid="right-pane">preview</div>) {
  return render(
    <AssignLoopShell
      headingText="Mechanism Gallery"
      modalityLabel="Desktop"
      leftContent={<div data-testid="left-pane">assign card</div>}
      rightContent={rightContent}
    />,
  );
}

describe("AssignLoopShell — desktop", () => {
  it("renders both panes inline with no preview trigger", () => {
    setViewportWidth(1280);
    renderShell();
    expect(screen.getByTestId("left-pane")).not.toBeNull();
    expect(screen.getByTestId("right-pane")).not.toBeNull();
    expect(screen.queryByTestId("assign-loop-show-preview")).toBeNull();
  });

  it("renders both panes at a landscape-phone width (844 — not narrow)", () => {
    setViewportWidth(844);
    renderShell();
    expect(screen.getByTestId("left-pane")).not.toBeNull();
    expect(screen.getByTestId("right-pane")).not.toBeNull();
    expect(screen.queryByTestId("assign-loop-show-preview")).toBeNull();
  });
});

describe("AssignLoopShell — narrow", () => {
  it("shows the preview trigger and keeps the preview unmounted while the sheet is closed", () => {
    setViewportWidth(390);
    renderShell();
    expect(screen.getByTestId("left-pane")).not.toBeNull();
    // Principle 9: the OSK iframe mounts only when the author opens the
    // sheet — rightContent stays out of the DOM until then.
    expect(screen.queryByTestId("right-pane")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Show keyboard preview" }),
    ).not.toBeNull();
  });

  it("opens the sheet with the preview content on trigger tap, and closes it", () => {
    setViewportWidth(390);
    renderShell();
    fireEvent.click(
      screen.getByRole("button", { name: "Show keyboard preview" }),
    );
    expect(screen.getByTestId("right-pane")).not.toBeNull();
    expect(
      screen.getByRole("dialog", { name: "Keyboard preview" }),
    ).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close preview" }));
    expect(screen.queryByTestId("right-pane")).toBeNull();
  });

  it("renders no trigger and no sheet when rightContent is omitted (T033 seam)", () => {
    setViewportWidth(390);
    render(
      <AssignLoopShell
        headingText="Key Grid"
        modalityLabel="Touch"
        leftContent={<div data-testid="left-pane">assign card</div>}
      />,
    );
    expect(screen.getByTestId("left-pane")).not.toBeNull();
    expect(screen.queryByTestId("assign-loop-show-preview")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

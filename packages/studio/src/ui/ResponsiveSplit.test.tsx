// ResponsiveSplit — two-pane collapse tests.
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { ResponsiveSplit } from "./ResponsiveSplit.tsx";

function setViewport(width: number): void {
  Object.defineProperty(window, "innerWidth", {
    value: width,
    configurable: true,
  });
  act(() => {
    window.dispatchEvent(new Event("resize"));
  });
}

afterEach(() => {
  cleanup();
  setViewport(1280);
});

describe("ResponsiveSplit", () => {
  it("lays panes out in a row on desktop", () => {
    render(
      <ResponsiveSplit
        primary={<span>A</span>}
        secondary={<span>B</span>}
        testId="split"
      />,
    );
    expect(screen.getByTestId("split").style.flexDirection).toBe("row");
  });

  it("stacks panes in a column on a narrow viewport", () => {
    setViewport(390);
    render(
      <ResponsiveSplit
        primary={<span>A</span>}
        secondary={<span>B</span>}
        testId="split"
      />,
    );
    expect(screen.getByTestId("split").style.flexDirection).toBe("column");
  });

  it("renders primary first, then secondary", () => {
    const { container } = render(
      <ResponsiveSplit
        primary={<span data-testid="p">A</span>}
        secondary={<span data-testid="s">B</span>}
      />,
    );
    const order = Array.from(container.querySelectorAll("[data-testid]")).map(
      (el) => el.getAttribute("data-testid"),
    );
    expect(order).toEqual(["p", "s"]);
  });

  it("honors a custom breakpoint", () => {
    setViewport(600);
    render(
      <ResponsiveSplit
        primary={<span>A</span>}
        secondary={<span>B</span>}
        breakpoint={768}
        testId="split"
      />,
    );
    expect(screen.getByTestId("split").style.flexDirection).toBe("column");
  });
});

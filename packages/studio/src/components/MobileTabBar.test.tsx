// MobileTabBar tests (mobile adaptation, Phase 1).
//
// The bar self-gates on `useIsNarrow()`: null on desktop viewports, the tab
// row on narrow ones. Viewport width is stubbed per-test via
// `window.innerWidth` (the geometry path needs no matchMedia stub — see
// useViewport.ts's fallback) and restored afterwards so no test leaks a
// phone viewport into its neighbours.
import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup, fireEvent } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { MobileTabBar } from "./MobileTabBar.tsx";
import { NAV_ITEMS } from "../lib/navItems.ts";

const DESKTOP_WIDTH = 1024;
const NARROW_WIDTH = 390;

function setViewportWidth(width: number): void {
  Object.defineProperty(window, "innerWidth", {
    value: width,
    configurable: true,
  });
}

describe("MobileTabBar", () => {
  afterEach(() => {
    cleanup();
    setViewportWidth(DESKTOP_WIDTH);
  });

  it("renders nothing on desktop viewports", () => {
    setViewportWidth(DESKTOP_WIDTH);
    render(<MobileTabBar active="survey" />);
    expect(screen.queryByTestId("mobile-tab-bar")).toBeNull();
  });

  it("renders one tab per nav item on narrow viewports", () => {
    setViewportWidth(NARROW_WIDTH);
    render(<MobileTabBar active="survey" />);
    const bar = screen.getByTestId("mobile-tab-bar");
    const links = bar.querySelectorAll("a");
    expect(links).toHaveLength(NAV_ITEMS.length);
    // Spot-check the four production tabs resolve to their routes.
    expect(
      screen.getByRole("link", { name: "Studio" }).getAttribute("href"),
    ).toBe("#survey");
    expect(
      screen.getByRole("link", { name: "Compare" }).getAttribute("href"),
    ).toBe("#preview");
    expect(
      screen.getByRole("link", { name: "Output" }).getAttribute("href"),
    ).toBe("#output");
    expect(
      screen.getByRole("link", { name: "Decisions" }).getAttribute("href"),
    ).toBe("#trail");
  });

  it("marks the active tab with aria-current='page' and no other tab", () => {
    setViewportWidth(NARROW_WIDTH);
    render(<MobileTabBar active="preview" />);
    const current = screen
      .getAllByRole("link")
      .filter((a) => a.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
    expect(current[0]?.textContent).toContain("Compare");
  });

  it("dims the Output tab with aria-disabled and the explanatory title while blocked", () => {
    setViewportWidth(NARROW_WIDTH);
    render(
      <MobileTabBar
        active="survey"
        outputBlocked
        outputBlockedTitle="Finish every inventory character before you can access Output"
      />,
    );
    const output = screen.getByRole("link", { name: "Output" });
    expect(output.getAttribute("aria-disabled")).toBe("true");
    expect(output.getAttribute("title")).toBe(
      "Finish every inventory character before you can access Output",
    );
    // The block is Output-only — the other tabs stay enabled.
    expect(
      screen
        .getByRole("link", { name: "Studio" })
        .getAttribute("aria-disabled"),
    ).toBeNull();
  });

  it("leaves the Output tab enabled when not blocked", () => {
    setViewportWidth(NARROW_WIDTH);
    render(<MobileTabBar active="survey" />);
    const output = screen.getByRole("link", { name: "Output" });
    expect(output.getAttribute("aria-disabled")).toBeNull();
    expect(output.getAttribute("title")).toBeNull();
  });

  it("exposes a labelled navigation landmark", () => {
    setViewportWidth(NARROW_WIDTH);
    render(<MobileTabBar active="survey" />);
    expect(screen.getByRole("navigation", { name: "Studio sections" })).toBe(
      screen.getByTestId("mobile-tab-bar"),
    );
  });

  it("is exactly 64px tall (thumb-zone bar)", () => {
    setViewportWidth(NARROW_WIDTH);
    render(<MobileTabBar active="survey" />);
    // No jest-dom in this repo's setup — assert the inline style directly.
    expect(screen.getByTestId("mobile-tab-bar").style.height).toBe("64px");
  });

  it("switches branches live when the viewport crosses the breakpoint", () => {
    setViewportWidth(DESKTOP_WIDTH);
    render(<MobileTabBar active="survey" />);
    expect(screen.queryByTestId("mobile-tab-bar")).toBeNull();
    setViewportWidth(NARROW_WIDTH);
    fireEvent(window, new Event("resize"));
    expect(screen.getByTestId("mobile-tab-bar")).not.toBeNull();
  });
});

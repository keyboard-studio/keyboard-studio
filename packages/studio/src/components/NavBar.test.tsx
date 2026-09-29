// NavBar tests (mobile adaptation #1853, Phase 1).
//
// Covers the slim narrow-viewport variant: center tab links hidden (route
// navigation moves to MobileTabBar), the keyboard indicator hidden, and the
// right-zone controls re-homed into a "more options" disclosure. Desktop
// assertions pin the untouched rendering.
//
// Viewport width is stubbed per-test via `window.innerWidth` and restored
// afterwards so no test leaks a phone viewport into its neighbours.
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { NavBar } from "./NavBar.tsx";

const DESKTOP_WIDTH = 1024;
const NARROW_WIDTH = 390;

function setViewportWidth(width: number): void {
  Object.defineProperty(window, "innerWidth", {
    value: width,
    configurable: true,
  });
}

const BASE_PROPS = {
  active: "survey" as const,
  unfinishedDesktopCount: 0,
  unfinishedTouchCount: 0,
  onNavigateToUnfinishedGallery: vi.fn(),
};

describe("NavBar", () => {
  afterEach(() => {
    cleanup();
    setViewportWidth(DESKTOP_WIDTH);
  });

  it("desktop: renders the center tab row, brand, and keyboard indicator", () => {
    setViewportWidth(DESKTOP_WIDTH);
    render(<NavBar {...BASE_PROPS} />);
    expect(
      screen.getByRole("link", { name: "Studio" }).getAttribute("href"),
    ).toBe("#survey");
    expect(screen.getByRole("link", { name: "Compare" })).not.toBeNull();
    expect(screen.getByRole("link", { name: "Output" })).not.toBeNull();
    expect(screen.getByRole("link", { name: "Decisions" })).not.toBeNull();
    expect(screen.getByText("Keyboard Studio")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: /No keyboard yet/ }),
    ).not.toBeNull();
    expect(screen.queryByRole("button", { name: "More options" })).toBeNull();
  });

  it("desktop: dims the Output tab while blocked", () => {
    setViewportWidth(DESKTOP_WIDTH);
    render(
      <NavBar
        {...BASE_PROPS}
        outputBlocked
        outputBlockedTitle="Finish every inventory character before you can access Output"
      />,
    );
    const output = screen.getByRole("link", { name: "Output" });
    expect(output.getAttribute("aria-disabled")).toBe("true");
    expect(output.getAttribute("title")).toBe(
      "Finish every inventory character before you can access Output",
    );
  });

  it("narrow: hides the tab row and keyboard indicator, shows the overflow disclosure", () => {
    setViewportWidth(NARROW_WIDTH);
    render(<NavBar {...BASE_PROPS} />);
    // Brand stays.
    expect(screen.getByText("Keyboard Studio")).not.toBeNull();
    // Center tabs move to MobileTabBar.
    expect(screen.queryByRole("link", { name: "Studio" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Compare" })).toBeNull();
    // The slim bar keeps brand + overflow only.
    expect(
      screen.queryByRole("button", { name: /No keyboard yet/ }),
    ).toBeNull();
    const overflow = screen.getByRole("button", { name: "More options" });
    expect(overflow.getAttribute("aria-expanded")).toBe("false");
  });

  it("narrow: opening the disclosure reveals the right-zone controls", () => {
    setViewportWidth(NARROW_WIDTH);
    render(<NavBar {...BASE_PROPS} />);
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    expect(
      screen
        .getByRole("button", { name: "More options" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    // Locale + theme switchers are re-homed, not dropped.
    expect(document.getElementById("nav-language-select")).not.toBeNull();
    expect(screen.getByTestId("theme-switcher")).not.toBeNull();
  });

  it("narrow: Escape dismisses the disclosure", () => {
    setViewportWidth(NARROW_WIDTH);
    render(<NavBar {...BASE_PROPS} />);
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    expect(document.getElementById("nav-language-select")).not.toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.getElementById("nav-language-select")).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "More options" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
  });

  it("narrow: the tab row returns when the viewport widens past the breakpoint", () => {
    setViewportWidth(NARROW_WIDTH);
    render(<NavBar {...BASE_PROPS} />);
    expect(screen.queryByRole("link", { name: "Studio" })).toBeNull();
    setViewportWidth(DESKTOP_WIDTH);
    fireEvent(window, new Event("resize"));
    expect(screen.getByRole("link", { name: "Studio" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "More options" })).toBeNull();
  });
});

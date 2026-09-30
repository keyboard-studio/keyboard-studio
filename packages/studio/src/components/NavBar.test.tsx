// NavBar tests (mobile adaptation, Phase 1).
//
// Covers the slim narrow-viewport variant: one row, center tab links and the
// keyboard indicator hidden, and both the route links and the right-zone
// controls re-homed into a "Menu" disclosure. Desktop assertions pin the
// untouched rendering.
//
// Viewport width is stubbed per-test via `window.innerWidth` and restored
// afterwards so no test leaks a phone viewport into its neighbours.
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { NavBar } from "./NavBar.tsx";
import { useJourneyContentsStore } from "../stores/journeyContentsStore.ts";

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
    useJourneyContentsStore.setState({
      available: false,
      open: false,
      origin: null,
    });
  });

  it("desktop: the bar carries the frosted-chrome class", () => {
    setViewportWidth(DESKTOP_WIDTH);
    render(<NavBar {...BASE_PROPS} />);
    expect(screen.getByRole("navigation").className).toContain(
      "ks-chrome-bar-top",
    );
  });

  it("narrow: the bar keeps its opaque look (no chrome class)", () => {
    setViewportWidth(NARROW_WIDTH);
    render(<NavBar {...BASE_PROPS} />);
    expect(screen.getByRole("navigation").className).not.toContain(
      "ks-chrome-bar-top",
    );
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
    expect(screen.queryByRole("button", { name: "Menu" })).toBeNull();
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

  it("narrow: hides the tab row and keyboard indicator, shows the menu disclosure", () => {
    setViewportWidth(NARROW_WIDTH);
    render(<NavBar {...BASE_PROPS} />);
    // Brand stays.
    expect(screen.getByText("Keyboard Studio")).not.toBeNull();
    // Center tabs move into the (closed) menu.
    expect(screen.queryByRole("link", { name: "Studio" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Compare" })).toBeNull();
    // The slim bar keeps brand + overflow only.
    expect(
      screen.queryByRole("button", { name: /No keyboard yet/ }),
    ).toBeNull();
    const menu = screen.getByRole("button", { name: "Menu" });
    expect(menu.getAttribute("aria-expanded")).toBe("false");
  });

  it("narrow: the menu lists the route links first, with the active one marked", () => {
    setViewportWidth(NARROW_WIDTH);
    render(
      <NavBar
        {...BASE_PROPS}
        outputBlocked
        outputBlockedTitle="Finish every inventory character before you can access Output"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    const studio = screen.getByRole("link", { name: "Studio" });
    expect(studio.getAttribute("href")).toBe("#survey");
    expect(studio.getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Compare" })).not.toBeNull();
    expect(
      screen.getByRole("link", { name: "Output" }).getAttribute("aria-disabled"),
    ).toBe("true");
    // Choosing a route closes the menu.
    fireEvent.click(screen.getByRole("link", { name: "Compare" }));
    expect(screen.queryByRole("link", { name: "Compare" })).toBeNull();
  });

  it("narrow: narrowCenter replaces the wordmark in the single row", () => {
    setViewportWidth(NARROW_WIDTH);
    render(
      <NavBar {...BASE_PROPS} narrowCenter={<span>Phase B summary</span>} />,
    );
    expect(screen.getByText("Phase B summary")).not.toBeNull();
    expect(screen.queryByText("Keyboard Studio")).toBeNull();
  });

  it("desktop: ignores narrowCenter", () => {
    setViewportWidth(DESKTOP_WIDTH);
    render(
      <NavBar {...BASE_PROPS} narrowCenter={<span>Phase B summary</span>} />,
    );
    expect(screen.queryByText("Phase B summary")).toBeNull();
    expect(screen.getByText("Keyboard Studio")).not.toBeNull();
  });

  it("narrow: opening the disclosure reveals the right-zone controls", () => {
    setViewportWidth(NARROW_WIDTH);
    render(<NavBar {...BASE_PROPS} />);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(
      screen
        .getByRole("button", { name: "Menu" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    // Locale + theme switchers are re-homed, not dropped.
    expect(document.getElementById("nav-language-select")).not.toBeNull();
    expect(screen.getByTestId("theme-switcher")).not.toBeNull();
  });

  it("narrow: Escape dismisses the disclosure", () => {
    setViewportWidth(NARROW_WIDTH);
    render(<NavBar {...BASE_PROPS} />);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(document.getElementById("nav-language-select")).not.toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.getElementById("nav-language-select")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Menu" }).getAttribute("aria-expanded"),
    ).toBe("false");
  });

  it("narrow: the tab row returns when the viewport widens past the breakpoint", () => {
    setViewportWidth(NARROW_WIDTH);
    render(<NavBar {...BASE_PROPS} />);
    expect(screen.queryByRole("link", { name: "Studio" })).toBeNull();
    setViewportWidth(DESKTOP_WIDTH);
    fireEvent(window, new Event("resize"));
    expect(screen.getByRole("link", { name: "Studio" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Menu" })).toBeNull();
  });

  it("narrow: the menu has no Contents item while the journey contents are unavailable", () => {
    setViewportWidth(NARROW_WIDTH);
    useJourneyContentsStore.setState({ available: false, open: false });
    render(<NavBar {...BASE_PROPS} />);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(screen.queryByTestId("nav-journey-contents")).toBeNull();
  });

  it("narrow: the Contents item closes the menu and opens the contents sheet", () => {
    setViewportWidth(NARROW_WIDTH);
    useJourneyContentsStore.setState({
      available: true,
      open: false,
      origin: null,
    });
    render(<NavBar {...BASE_PROPS} />);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    const contents = screen.getByTestId("nav-journey-contents");
    expect(contents.textContent).toBe("Contents");
    fireEvent.click(contents);
    expect(useJourneyContentsStore.getState().open).toBe(true);
    // The sheet anchors its enter/exit at the menu item that opened it.
    expect(useJourneyContentsStore.getState().origin).not.toBeNull();
    // Menu closed.
    expect(screen.queryByTestId("nav-journey-contents")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Menu" }).getAttribute("aria-expanded"),
    ).toBe("false");
  });

  it("desktop: never shows the Contents item even when available", () => {
    setViewportWidth(DESKTOP_WIDTH);
    useJourneyContentsStore.setState({ available: true, open: false });
    render(<NavBar {...BASE_PROPS} />);
    expect(screen.queryByTestId("nav-journey-contents")).toBeNull();
  });
});

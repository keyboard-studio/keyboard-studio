// UnfinishedGalleryIndicator — show/hide + count-rendering unit tests.
//
// Pure props-driven (see the component's own docstring): no store, no engine,
// no hook mocking needed — just render with the three prop combinations that
// matter (both zero, desktop-only, touch-only, both nonzero) and assert on
// the rendered text + click routing.

import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { render } from "../test/renderWithI18n.tsx";
import { UnfinishedGalleryIndicator } from "./UnfinishedGalleryIndicator.tsx";

afterEach(() => {
  cleanup();
});

describe("UnfinishedGalleryIndicator", () => {
  it("renders nothing when both counts are zero", () => {
    const onNavigate = vi.fn();
    const { container } = render(
      <UnfinishedGalleryIndicator desktopCount={0} touchCount={0} onNavigate={onNavigate} />,
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows only the desktop control when only the desktop count is nonzero", () => {
    const onNavigate = vi.fn();
    render(<UnfinishedGalleryIndicator desktopCount={3} touchCount={0} onNavigate={onNavigate} />);

    const desktopButton = screen.getByTestId("nav-unfinished-gallery-desktop");
    expect(desktopButton.tagName).toBe("BUTTON");
    // Real <button> text content doubles as its accessible name — no extra
    // aria-label needed. Copy framing: "still need review", never "missing".
    expect(desktopButton.textContent).toContain("3 characters");
    expect(desktopButton.textContent).toContain("still need review");
    expect(desktopButton.textContent).not.toMatch(/missing/i);
    expect(desktopButton.textContent).toContain("Mechanism Gallery");

    expect(screen.queryByTestId("nav-unfinished-gallery-touch")).toBeNull();
  });

  it("shows only the touch control when only the touch count is nonzero", () => {
    const onNavigate = vi.fn();
    render(<UnfinishedGalleryIndicator desktopCount={0} touchCount={1} onNavigate={onNavigate} />);

    const touchButton = screen.getByTestId("nav-unfinished-gallery-touch");
    // Singular plural form ("# character", not "# characters").
    expect(touchButton.textContent).toContain("1 character");
    expect(touchButton.textContent).not.toContain("1 characters");
    expect(touchButton.textContent).toContain("Touch Gallery");

    expect(screen.queryByTestId("nav-unfinished-gallery-desktop")).toBeNull();
  });

  it("shows both controls, independently, when both counts are nonzero", () => {
    const onNavigate = vi.fn();
    render(<UnfinishedGalleryIndicator desktopCount={5} touchCount={2} onNavigate={onNavigate} />);

    expect(screen.getByTestId("nav-unfinished-gallery-desktop").textContent).toContain("5 characters");
    expect(screen.getByTestId("nav-unfinished-gallery-touch").textContent).toContain("2 characters");
  });

  it("routes to the mechanism gallery on desktop click, touch gallery on touch click", () => {
    const onNavigate = vi.fn();
    render(<UnfinishedGalleryIndicator desktopCount={4} touchCount={6} onNavigate={onNavigate} />);

    fireEvent.click(screen.getByTestId("nav-unfinished-gallery-desktop"));
    expect(onNavigate).toHaveBeenCalledWith("mechanisms");

    fireEvent.click(screen.getByTestId("nav-unfinished-gallery-touch"));
    expect(onNavigate).toHaveBeenCalledWith("touch");
    expect(onNavigate).toHaveBeenCalledTimes(2);
  });

  it("hides a control again once its count drops back to zero (rerender)", () => {
    const onNavigate = vi.fn();
    const { rerender } = render(
      <UnfinishedGalleryIndicator desktopCount={2} touchCount={0} onNavigate={onNavigate} />,
    );
    expect(screen.getByTestId("nav-unfinished-gallery-desktop")).toBeTruthy();

    rerender(<UnfinishedGalleryIndicator desktopCount={0} touchCount={0} onNavigate={onNavigate} />);
    expect(screen.queryByTestId("nav-unfinished-gallery-desktop")).toBeNull();
  });
});

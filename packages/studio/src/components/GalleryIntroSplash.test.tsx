// Unit tests for GalleryIntroSplash — the shared first-entry orientation splash
// used by both the desktop Mechanism Gallery and the Touch Gallery. The gallery
// suites cover the wired-up behaviour; these pin the component's own prop API
// (content rendering, onStart/onBack callbacks, and the optional Back button).

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { GalleryIntroSplash } from "./GalleryIntroSplash";

afterEach(cleanup);

function renderSplash(overrides: Partial<Parameters<typeof GalleryIntroSplash>[0]> = {}) {
  const props = {
    eyebrow: "Getting started · Desktop",
    title: "Welcome to the Test Gallery",
    body: <>Body copy goes here.</>,
    bullets: [<>First bullet.</>, <>Second bullet.</>],
    startAriaLabel: "Start the test gallery",
    onStart: vi.fn(),
    ...overrides,
  };
  render(<GalleryIntroSplash {...props} />);
  return props;
}

describe("GalleryIntroSplash", () => {
  it("renders eyebrow, title, body, and every bullet", () => {
    renderSplash();
    expect(screen.getByText(/Getting started · Desktop/)).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: /Welcome to the Test Gallery/ })).toBeTruthy();
    expect(screen.getByText(/Body copy goes here/)).toBeTruthy();
    expect(screen.getByText(/First bullet/)).toBeTruthy();
    expect(screen.getByText(/Second bullet/)).toBeTruthy();
  });

  it("fires onStart when 'Get started' is clicked", () => {
    const { onStart } = renderSplash();
    fireEvent.click(screen.getByRole("button", { name: /start the test gallery/i }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("shows a Back button (with aria-label) and fires onBack when provided", () => {
    const onBack = vi.fn();
    renderSplash({ onBack, backAriaLabel: "Back to the previous step" });
    const backBtn = screen.getByRole("button", { name: /back to the previous step/i });
    fireEvent.click(backBtn);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("omits the Back button when onBack is not provided", () => {
    renderSplash();
    // Only the "Get started" button should be present.
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.getAttribute("aria-label")).toMatch(/start the test gallery/i);
  });
});

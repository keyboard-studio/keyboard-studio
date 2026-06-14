// Unit tests for TouchGate — two-state lock-gate stub.
// Unlocked: shows "Desktop layout not locked" gate with a link to #mechanisms.
// Locked: shows the "Touch gallery — coming soon" stub.

import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { TouchGate } from "../StudioShell";
import { useSurveyResultsStore } from "../stores/surveyResultsStore";

afterEach(() => {
  cleanup();
  useSurveyResultsStore.getState().reset();
});

beforeEach(() => {
  useSurveyResultsStore.getState().reset();
});

describe("TouchGate — unlocked state", () => {
  it("shows the lock-first gate message when desktop is not locked", () => {
    // Store starts unlocked after reset.
    render(<TouchGate />);
    expect(screen.getByText(/Desktop layout not locked/i)).toBeTruthy();
  });

  it("provides a link back to #mechanisms when unlocked", () => {
    render(<TouchGate />);
    const link = screen.getByRole("link", {
      name: /Go to Mechanisms to lock the desktop layout/i,
    });
    expect(link.getAttribute("href")).toBe("#mechanisms");
  });

  it("does NOT show the coming-soon stub when unlocked", () => {
    render(<TouchGate />);
    expect(screen.queryByText(/coming soon/i)).toBeNull();
  });
});

describe("TouchGate — locked state", () => {
  it("shows the coming-soon stub when desktop is locked", () => {
    useSurveyResultsStore.getState().lockDesktop();
    render(<TouchGate />);
    expect(screen.getByText(/coming soon/i)).toBeTruthy();
  });

  it("shows the Touch gallery heading when locked", () => {
    useSurveyResultsStore.getState().lockDesktop();
    render(<TouchGate />);
    expect(screen.getByText(/Touch gallery/i)).toBeTruthy();
  });

  it("does NOT show the lock-first gate message when locked", () => {
    useSurveyResultsStore.getState().lockDesktop();
    render(<TouchGate />);
    expect(screen.queryByText(/Desktop layout not locked/i)).toBeNull();
  });
});

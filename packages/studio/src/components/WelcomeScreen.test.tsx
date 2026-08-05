// WelcomeScreen tests — the three "leave welcome" actions (Sign in with
// GitHub / Google, "Continue as guest") must mark the browser as visited so the
// first-visit gate does not bounce the author back here on the OAuth return
// or a later reload.
//
// The guest path also carries a warning about where a guest's work is saved.
// That warning is asserted here (not just eyeballed) because the component's
// header comment commits to its accuracy: it is the one place the UI tells an
// author their work is browser-scoped, so silently losing it is a regression.

import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, fireEvent, cleanup } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";

const ghConnect = vi.fn();
const googleConnect = vi.fn();

vi.mock("../hooks/useGitHubAuth.ts", () => ({
  useGitHubAuth: () => ({ connect: ghConnect, error: null }),
}));
vi.mock("../hooks/useGoogleAuth.ts", () => ({
  useGoogleAuth: () => ({ connect: googleConnect, error: null }),
}));
vi.mock("../lib/navigate.ts", () => ({
  navigateTo: vi.fn(),
}));

import { WelcomeScreen } from "./WelcomeScreen.tsx";
import { navigateTo } from "../lib/navigate.ts";
import { hasVisited } from "../lib/firstVisit.ts";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

describe("WelcomeScreen — marks visited on leaving", () => {
  it("does not mark visited on mount", () => {
    render(<WelcomeScreen />);
    expect(hasVisited()).toBe(false);
  });

  it('marks visited and connects when "Sign in with GitHub" is clicked', () => {
    render(<WelcomeScreen />);
    fireEvent.click(screen.getByText("Sign in with GitHub"));
    expect(hasVisited()).toBe(true);
    expect(ghConnect).toHaveBeenCalledTimes(1);
  });

  it('marks visited and connects when "Sign in with Google" is clicked', () => {
    render(<WelcomeScreen />);
    fireEvent.click(screen.getByText("Sign in with Google"));
    expect(hasVisited()).toBe(true);
    expect(googleConnect).toHaveBeenCalledTimes(1);
  });

  it('marks visited and navigates to survey when "Continue as guest" is clicked', () => {
    render(<WelcomeScreen />);
    fireEvent.click(screen.getByText("Continue as guest"));
    expect(hasVisited()).toBe(true);
    expect(navigateTo).toHaveBeenCalledWith("survey");
  });
});

describe("WelcomeScreen — sign-in rationale", () => {
  it("tells a guest their work is browser-scoped, and that signing in carries it over", () => {
    render(<WelcomeScreen />);
    // Both halves of the honest warning: the scope limit AND the way out of it.
    // Asserting only the first would let the copy decay into a dead end that
    // never mentions signing in later works.
    expect(screen.getByText(/saved in this browser only/i)).toBeTruthy();
    expect(screen.getByText(/sign in at any time/i)).toBeTruthy();
  });

  it("gives a reason to sign in rather than only offering the buttons", () => {
    render(<WelcomeScreen />);
    // The bold lead-ins are scoped to `strong`: without a selector each phrase
    // matches BOTH the <strong> and the enclosing <p>, which getByText rejects
    // as multiple matches rather than reporting the assertion we meant.
    expect(screen.getByText(/Sign in to keep your work/i, { selector: "strong" })).toBeTruthy();
    expect(screen.getByText(/pick up where you left off/i)).toBeTruthy();
  });

  it("explains what Studio is before asking for a decision", () => {
    render(<WelcomeScreen />);
    expect(screen.getByText(/Build a working Keyman keyboard for your language/i)).toBeTruthy();
    expect(screen.getByText(/Describe your writing system/i, { selector: "strong" })).toBeTruthy();
    expect(screen.getByText(/Confirm what we propose/i, { selector: "strong" })).toBeTruthy();
    expect(screen.getByText(/Ship it/i, { selector: "strong" })).toBeTruthy();
  });
});

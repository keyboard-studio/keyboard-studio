// WelcomeScreen tests — the three "leave welcome" actions (Sign in with
// GitHub / Google, "I'm new") must mark the browser as visited so the
// first-visit gate does not bounce the author back here on the OAuth return
// or a later reload.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

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

  it('marks visited and navigates to survey when "I\'m new" is clicked', () => {
    render(<WelcomeScreen />);
    fireEvent.click(screen.getByText(/I.m new/));
    expect(hasVisited()).toBe(true);
    expect(navigateTo).toHaveBeenCalledWith("survey");
  });
});

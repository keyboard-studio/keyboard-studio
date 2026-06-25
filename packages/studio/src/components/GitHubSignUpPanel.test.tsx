// Tests for GitHubSignUpPanel — the decoupled "Sign up with GitHub" control.
//
// The OAuth lifecycle (useGitHubAuth) is mocked; these tests assert the panel's
// rendering + that it is an IDENTITY control only (no Submit PR / branch / PR
// vocabulary, per docs/github-integration.md §1a).

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { GitHubSignUpPanel } from "./GitHubSignUpPanel.tsx";
import { useGitHubAuth, type UseGitHubAuthResult } from "../hooks/useGitHubAuth.ts";

vi.mock("../hooks/useGitHubAuth.ts", () => ({ useGitHubAuth: vi.fn() }));
const mockedUseGitHubAuth = vi.mocked(useGitHubAuth);

const connect = vi.fn(async () => {});
const disconnect = vi.fn();

function mockAuth(overrides: Partial<UseGitHubAuthResult>): void {
  mockedUseGitHubAuth.mockReturnValue({
    status: "idle",
    token: null,
    verify: null,
    login: null,
    canSubmit: false,
    missingScopes: [],
    error: null,
    connect,
    disconnect,
    ...overrides,
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("GitHubSignUpPanel", () => {
  it("shows the GitHub sign-up button when signed out (idle)", () => {
    mockAuth({ status: "idle" });
    render(<GitHubSignUpPanel />);
    expect(screen.getByRole("button", { name: "Sign up with GitHub" })).toBeTruthy();
  });

  it("calls connect() when the GitHub button is clicked", () => {
    mockAuth({ status: "idle" });
    render(<GitHubSignUpPanel />);
    screen.getByRole("button", { name: "Sign up with GitHub" }).click();
    expect(connect).toHaveBeenCalledOnce();
  });

  it("offers Google sign-up as a disabled placeholder", () => {
    mockAuth({ status: "idle" });
    render(<GitHubSignUpPanel />);
    const google = screen.getByRole("button", { name: /Sign up with Google/ }) as HTMLButtonElement;
    expect(google.disabled).toBe(true);
  });

  it("shows the signed-in identity + sign-out when connected", () => {
    mockAuth({ status: "connected", login: "octocat" });
    render(<GitHubSignUpPanel />);
    expect(screen.getByText(/Signed up with GitHub as octocat/)).toBeTruthy();
    const signOut = screen.getByRole("button", { name: "Sign out" });
    signOut.click();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Sign up with GitHub" })).toBeNull();
  });

  it("treats needs-scope as signed-in (identity established)", () => {
    mockAuth({ status: "needs-scope", login: "octocat" });
    render(<GitHubSignUpPanel />);
    expect(screen.getByText(/Signed up with GitHub/)).toBeTruthy();
  });

  it("renders the error message on failure", () => {
    mockAuth({ status: "error", error: "GitHub sign-in could not be completed. Please try connecting again." });
    render(<GitHubSignUpPanel />);
    expect(screen.getByRole("alert").textContent).toContain("could not be completed");
  });

  it("is an identity control only — no Submit PR / branch / pull request vocabulary", () => {
    mockAuth({ status: "connected", login: "octocat" });
    const { container } = render(<GitHubSignUpPanel />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/submit pr|pull request|branch/i);
  });
});

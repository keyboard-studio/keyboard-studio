// Tests for SignUpPanel — the decoupled "Sign up with GitHub / Google" control.
//
// The OAuth lifecycle hooks (useGitHubAuth, useGoogleAuth) are mocked; these
// tests assert the panel's rendering + that it is an IDENTITY control only
// (no Submit PR / branch / PR vocabulary, per docs/github-integration.md §1a).

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SignUpPanel } from "./SignUpPanel.tsx";
import { useGitHubAuth, type UseGitHubAuthResult } from "../hooks/useGitHubAuth.ts";
import { useGoogleAuth, type UseGoogleAuthResult } from "../hooks/useGoogleAuth.ts";

vi.mock("../hooks/useGitHubAuth.ts", () => ({ useGitHubAuth: vi.fn() }));
vi.mock("../hooks/useGoogleAuth.ts", () => ({ useGoogleAuth: vi.fn() }));
const mockedUseGitHubAuth = vi.mocked(useGitHubAuth);
const mockedUseGoogleAuth = vi.mocked(useGoogleAuth);

const connect = vi.fn(async () => {});
const disconnect = vi.fn();
const googleConnect = vi.fn(async () => {});
const googleDisconnect = vi.fn();

function mockAuth(
  ghOverrides: Partial<UseGitHubAuthResult>,
  googleOverrides: Partial<UseGoogleAuthResult> = {},
): void {
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
    ...ghOverrides,
  });
  mockedUseGoogleAuth.mockReturnValue({
    status: "idle",
    identity: null,
    error: null,
    connect: googleConnect,
    disconnect: googleDisconnect,
    ...googleOverrides,
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SignUpPanel", () => {
  it("shows the GitHub sign-up button when signed out (idle)", () => {
    mockAuth({ status: "idle" });
    render(<SignUpPanel />);
    expect(screen.getByRole("button", { name: "Sign up with GitHub" })).toBeTruthy();
  });

  it("calls connect() when the GitHub button is clicked", () => {
    mockAuth({ status: "idle" });
    render(<SignUpPanel />);
    screen.getByRole("button", { name: "Sign up with GitHub" }).click();
    expect(connect).toHaveBeenCalledOnce();
  });

  it("shows the Google sign-up button enabled (not a disabled placeholder)", () => {
    mockAuth({ status: "idle" });
    render(<SignUpPanel />);
    const google = screen.getByRole("button", { name: "Sign up with Google" }) as HTMLButtonElement;
    expect(google.disabled).toBe(false);
  });

  it("calls google connect() when the Google button is clicked", () => {
    mockAuth({ status: "idle" });
    render(<SignUpPanel />);
    screen.getByRole("button", { name: "Sign up with Google" }).click();
    expect(googleConnect).toHaveBeenCalledOnce();
  });

  it("shows the signed-in GitHub identity + sign-out when GitHub connected", () => {
    mockAuth({ status: "connected", login: "octocat" });
    render(<SignUpPanel />);
    expect(screen.getByText(/Signed up with GitHub as octocat/)).toBeTruthy();
    const signOut = screen.getByRole("button", { name: "Sign out" });
    signOut.click();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Sign up with GitHub" })).toBeNull();
  });

  it("treats needs-scope as signed-in (identity established)", () => {
    mockAuth({ status: "needs-scope", login: "octocat" });
    render(<SignUpPanel />);
    expect(screen.getByText(/Signed up with GitHub/)).toBeTruthy();
  });

  it("shows the signed-in Google identity + sign-out when Google connected", () => {
    mockAuth(
      { status: "idle" },
      {
        status: "connected",
        identity: {
          provider: "google",
          sub: "1234567890",
          email: "user@example.com",
          emailVerified: true,
          name: "Test User",
          picture: "https://example.com/photo.jpg",
        },
      },
    );
    render(<SignUpPanel />);
    expect(screen.getByText(/Signed in with Google as Test User/)).toBeTruthy();
    const signOut = screen.getByRole("button", { name: "Sign out" });
    signOut.click();
    expect(googleDisconnect).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Sign up with Google" })).toBeNull();
  });

  it("renders the GitHub error message on failure", () => {
    mockAuth({ status: "error", error: "GitHub sign-in could not be completed. Please try connecting again." });
    render(<SignUpPanel />);
    expect(screen.getByRole("alert").textContent).toContain("could not be completed");
  });

  it("renders the Google error message on failure", () => {
    mockAuth(
      { status: "idle" },
      { status: "error", error: "Google sign-in could not be completed. Please try connecting again." },
    );
    render(<SignUpPanel />);
    expect(screen.getByRole("alert").textContent).toContain("could not be completed");
  });

  it("is an identity control only — no Submit PR / branch / pull request vocabulary", () => {
    mockAuth({ status: "connected", login: "octocat" });
    const { container } = render(<SignUpPanel />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/submit pr|pull request|branch/i);
  });
});

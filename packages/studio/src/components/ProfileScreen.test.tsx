// Tests for ProfileScreen — the full-screen account management card.
//
// Mocking idiom: same as AccountControl.test.tsx — mock useGitHubAuth and
// useGoogleAuth at the module boundary; let useIdentitySession run its real
// composition logic so derived state is honest.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { ProfileScreen } from "./ProfileScreen.tsx";
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
  // Reset hash set by navigateTo() between tests.
  window.location.hash = "";
});

describe("ProfileScreen — guest (neither provider linked)", () => {
  it("renders 'Link GitHub' button when GitHub is not connected", () => {
    mockAuth({ status: "idle" });
    render(<ProfileScreen />);
    expect(screen.getByRole("button", { name: "Link GitHub" })).toBeTruthy();
  });

  it("renders 'Link Google account' button when Google is not connected", () => {
    mockAuth({ status: "idle" });
    render(<ProfileScreen />);
    expect(screen.getByRole("button", { name: "Link Google account" })).toBeTruthy();
  });

  it("renders both link buttons simultaneously when neither provider is linked", () => {
    mockAuth({ status: "idle" });
    render(<ProfileScreen />);
    expect(screen.getByRole("button", { name: "Link GitHub" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Link Google account" })).toBeTruthy();
  });
});

describe("ProfileScreen — GitHub linked", () => {
  it("shows the GitHub login name when GitHub is connected", () => {
    mockAuth({ status: "connected", login: "octocat" });
    render(<ProfileScreen />);
    // The login appears in both the heading sub-paragraph and the provider row.
    expect(screen.getAllByText("octocat").length).toBeGreaterThanOrEqual(1);
  });

  it("renders a 'Sign out' button for GitHub when connected", () => {
    mockAuth({ status: "connected", login: "octocat" });
    render(<ProfileScreen />);
    expect(screen.getByRole("button", { name: "Sign out of GitHub" })).toBeTruthy();
  });

  it("calls github.disconnect() when the GitHub 'Sign out' button is clicked", () => {
    mockAuth({ status: "connected", login: "octocat" });
    render(<ProfileScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out of GitHub" }));
    expect(disconnect).toHaveBeenCalledOnce();
    expect(googleDisconnect).not.toHaveBeenCalled();
  });

  it("does not render the 'Link GitHub' button when GitHub is already linked", () => {
    mockAuth({ status: "connected", login: "octocat" });
    render(<ProfileScreen />);
    expect(screen.queryByRole("button", { name: "Link GitHub" })).toBeNull();
  });
});

describe("ProfileScreen — Google linked", () => {
  it("shows the Google display name when Google is connected", () => {
    mockAuth(
      { status: "idle" },
      {
        status: "connected",
        identity: {
          provider: "google",
          sub: "456",
          email: "tester@example.com",
          emailVerified: true,
          name: "Tester User",
          picture: "",
        },
      },
    );
    render(<ProfileScreen />);
    // The name appears in both the heading sub-paragraph and the provider row.
    expect(screen.getAllByText("Tester User").length).toBeGreaterThanOrEqual(1);
  });

  it("shows the Google email when Google is connected", () => {
    mockAuth(
      { status: "idle" },
      {
        status: "connected",
        identity: {
          provider: "google",
          sub: "456",
          email: "tester@example.com",
          emailVerified: true,
          name: "Tester User",
          picture: "",
        },
      },
    );
    render(<ProfileScreen />);
    expect(screen.getByText("tester@example.com")).toBeTruthy();
  });

  it("calls google.disconnect() when the Google 'Sign out' button is clicked", () => {
    mockAuth(
      { status: "idle" },
      {
        status: "connected",
        identity: {
          provider: "google",
          sub: "456",
          email: "tester@example.com",
          emailVerified: true,
          name: "Tester User",
          picture: "",
        },
      },
    );
    render(<ProfileScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out of Google" }));
    expect(googleDisconnect).toHaveBeenCalledOnce();
    expect(disconnect).not.toHaveBeenCalled();
  });

  it("does not render the 'Link Google account' button when Google is already linked", () => {
    mockAuth(
      { status: "idle" },
      {
        status: "connected",
        identity: {
          provider: "google",
          sub: "456",
          email: "tester@example.com",
          emailVerified: true,
          name: "Tester User",
          picture: "",
        },
      },
    );
    render(<ProfileScreen />);
    expect(screen.queryByRole("button", { name: "Link Google account" })).toBeNull();
  });
});

describe("ProfileScreen — both providers linked (disconnect isolation)", () => {
  const bothLinked = (): void => {
    mockAuth(
      { status: "connected", login: "octocat" },
      {
        status: "connected",
        identity: {
          provider: "google",
          sub: "456",
          email: "tester@example.com",
          emailVerified: true,
          name: "Tester User",
          picture: "",
        },
      },
    );
  };

  it("renders two Sign-out controls when both providers are linked", () => {
    bothLinked();
    render(<ProfileScreen />);
    expect(screen.getByRole("button", { name: "Sign out of GitHub" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out of Google" })).toBeTruthy();
  });

  it("clicking 'Sign out of GitHub' calls only github.disconnect()", () => {
    bothLinked();
    render(<ProfileScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out of GitHub" }));
    expect(disconnect).toHaveBeenCalledOnce();
    expect(googleDisconnect).not.toHaveBeenCalled();
  });

  it("clicking 'Sign out of Google' calls only google.disconnect()", () => {
    bothLinked();
    render(<ProfileScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out of Google" }));
    expect(googleDisconnect).toHaveBeenCalledOnce();
    expect(disconnect).not.toHaveBeenCalled();
  });
});

describe("ProfileScreen — error display", () => {
  it("renders github.error text as an alert when a GitHub error is present", () => {
    mockAuth({ status: "idle", error: "GitHub sign-in was rejected." });
    render(<ProfileScreen />);
    const alerts = screen.getAllByRole("alert");
    const ghAlert = alerts.find((el) => el.textContent === "GitHub sign-in was rejected.");
    expect(ghAlert).toBeTruthy();
  });

  it("renders google.error text as an alert when a Google error is present", () => {
    mockAuth(
      { status: "idle" },
      { status: "error", error: "Google sign-in could not be completed." },
    );
    render(<ProfileScreen />);
    const alerts = screen.getAllByRole("alert");
    const googleAlert = alerts.find(
      (el) => el.textContent === "Google sign-in could not be completed.",
    );
    expect(googleAlert).toBeTruthy();
  });

  it("does not render an alert when there is no error", () => {
    mockAuth({ status: "idle" });
    render(<ProfileScreen />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("ProfileScreen — back navigation", () => {
  it("navigates to #survey when 'Back to studio' is clicked", () => {
    mockAuth({ status: "idle" });
    render(<ProfileScreen />);
    fireEvent.click(screen.getByRole("button", { name: /Back to studio/i }));
    expect(window.location.hash).toBe("#survey");
  });
});

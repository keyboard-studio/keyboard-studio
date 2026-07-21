// Tests for ProfileScreen — the top-left focused account page.
//
// Layout: large avatar + username top-left, GitHub/Google details on the right,
// and a single global "Sign out" button at the bottom (Keyboard Studio is one
// account — no per-provider sign-out).
//
// Mocking idiom: same as AccountControl.test.tsx — mock useGitHubAuth and
// useGoogleAuth at the module boundary; let useIdentitySession run its real
// composition logic so derived state is honest.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { messages as enMessages } from "../locales/en/messages.json?lingui";
import { ProfileScreen } from "./ProfileScreen.tsx";
import { useGitHubAuth, type UseGitHubAuthResult } from "../hooks/useGitHubAuth.ts";
import { useGoogleAuth, type UseGoogleAuthResult } from "../hooks/useGoogleAuth.ts";

// ProfileScreen now calls useLingui() (Trans/t macros), which requires an
// I18nProvider ancestor (see docs/i18n-spike.md). Activate the source (en)
// catalog so t()/Trans resolve to the English text the assertions expect.
i18n.load("en", enMessages);
i18n.activate("en");

function renderProfileScreen() {
  return render(
    <I18nProvider i18n={i18n}>
      <ProfileScreen />
    </I18nProvider>,
  );
}

vi.mock("../hooks/useGitHubAuth.ts", () => ({ useGitHubAuth: vi.fn() }));
vi.mock("../hooks/useGoogleAuth.ts", () => ({ useGoogleAuth: vi.fn() }));

const mockedUseGitHubAuth = vi.mocked(useGitHubAuth);
const mockedUseGoogleAuth = vi.mocked(useGoogleAuth);

const connect = vi.fn(async () => {});
const disconnect = vi.fn();
const googleConnect = vi.fn(async () => {});
const googleDisconnect = vi.fn();

const googleIdentity = {
  provider: "google" as const,
  sub: "456",
  email: "tester@example.com",
  emailVerified: true,
  name: "Tester User",
  picture: "",
};

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
  it("renders a 'link github' control when GitHub is not connected", () => {
    mockAuth({ status: "idle" });
    renderProfileScreen();
    expect(screen.getByRole("button", { name: "Link GitHub" })).toBeTruthy();
  });

  it("renders a 'link google' control when Google is not connected", () => {
    mockAuth({ status: "idle" });
    renderProfileScreen();
    expect(screen.getByRole("button", { name: "Link Google" })).toBeTruthy();
  });

  it("clicking 'link github' starts the GitHub connect flow", () => {
    mockAuth({ status: "idle" });
    renderProfileScreen();
    fireEvent.click(screen.getByRole("button", { name: "Link GitHub" }));
    expect(connect).toHaveBeenCalledOnce();
  });

  it("clicking 'link google' starts the Google connect flow", () => {
    mockAuth({ status: "idle" });
    renderProfileScreen();
    fireEvent.click(screen.getByRole("button", { name: "Link Google" }));
    expect(googleConnect).toHaveBeenCalledOnce();
  });

  it("does not render a 'Sign out' button when no provider is linked", () => {
    mockAuth({ status: "idle" });
    renderProfileScreen();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  });
});

describe("ProfileScreen — GitHub linked", () => {
  it("shows the GitHub login name when GitHub is connected", () => {
    mockAuth({ status: "connected", login: "octocat" });
    renderProfileScreen();
    // Login appears as the username heading and in the github: line.
    expect(screen.getAllByText("octocat").length).toBeGreaterThanOrEqual(1);
  });

  it("does not render a 'link github' control when GitHub is already linked", () => {
    mockAuth({ status: "connected", login: "octocat" });
    renderProfileScreen();
    expect(screen.queryByRole("button", { name: "Link GitHub" })).toBeNull();
  });

  it("renders the single 'Sign out' button when signed in", () => {
    mockAuth({ status: "connected", login: "octocat" });
    renderProfileScreen();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });

  it("still offers 'link google' when only GitHub is linked", () => {
    mockAuth({ status: "connected", login: "octocat" });
    renderProfileScreen();
    expect(screen.getByRole("button", { name: "Link Google" })).toBeTruthy();
  });
});

describe("ProfileScreen — Google linked", () => {
  it("shows the Google display name when Google is connected", () => {
    mockAuth({ status: "idle" }, { status: "connected", identity: googleIdentity });
    renderProfileScreen();
    // Name appears as the username heading and in the google: line.
    expect(screen.getAllByText("Tester User").length).toBeGreaterThanOrEqual(1);
  });

  it("does not render a 'link google' control when Google is already linked", () => {
    mockAuth({ status: "idle" }, { status: "connected", identity: googleIdentity });
    renderProfileScreen();
    expect(screen.queryByRole("button", { name: "Link Google" })).toBeNull();
  });
});

describe("ProfileScreen — single global sign-out (one account)", () => {
  it("renders exactly one 'Sign out' button when both providers are linked", () => {
    mockAuth(
      { status: "connected", login: "octocat" },
      { status: "connected", identity: googleIdentity },
    );
    renderProfileScreen();
    expect(screen.getAllByRole("button", { name: "Sign out" })).toHaveLength(1);
  });

  it("does not render any per-provider sign-out buttons", () => {
    mockAuth(
      { status: "connected", login: "octocat" },
      { status: "connected", identity: googleIdentity },
    );
    renderProfileScreen();
    expect(screen.queryByRole("button", { name: "Sign out of GitHub" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sign out of Google" })).toBeNull();
  });

  it("clicking 'Sign out' disconnects both providers", () => {
    mockAuth(
      { status: "connected", login: "octocat" },
      { status: "connected", identity: googleIdentity },
    );
    renderProfileScreen();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(disconnect).toHaveBeenCalledOnce();
    expect(googleDisconnect).toHaveBeenCalledOnce();
  });
});

describe("ProfileScreen — verifying (token round-trip in flight)", () => {
  it("does not flash the 'Guest' state while the GitHub token is being verified", () => {
    mockAuth({ status: "verifying" });
    renderProfileScreen();
    // No "Guest" heading, no "?" avatar, and none of the link/sign-out controls
    // should appear before the token round-trip resolves.
    expect(screen.queryByText("Guest")).toBeNull();
    expect(screen.queryByText("?")).toBeNull();
    expect(screen.queryByRole("button", { name: "Link GitHub" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Link Google" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  });

  it("renders a neutral status placeholder while verifying", () => {
    mockAuth({ status: "verifying" });
    renderProfileScreen();
    expect(screen.getByRole("status")).toBeTruthy();
  });
});

describe("ProfileScreen — error display", () => {
  it("renders github.error text as an alert when a GitHub error is present", () => {
    mockAuth({ status: "idle", error: "GitHub sign-in was rejected." });
    renderProfileScreen();
    const alerts = screen.getAllByRole("alert");
    const ghAlert = alerts.find((el) => el.textContent === "GitHub sign-in was rejected.");
    expect(ghAlert).toBeTruthy();
  });

  it("renders google.error text as an alert when a Google error is present", () => {
    mockAuth(
      { status: "idle" },
      { status: "error", error: "Google sign-in could not be completed." },
    );
    renderProfileScreen();
    const alerts = screen.getAllByRole("alert");
    const googleAlert = alerts.find(
      (el) => el.textContent === "Google sign-in could not be completed.",
    );
    expect(googleAlert).toBeTruthy();
  });

  it("does not render an alert when there is no error", () => {
    mockAuth({ status: "idle" });
    renderProfileScreen();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("ProfileScreen — back navigation", () => {
  it("navigates to #survey when 'Back to studio' is clicked", () => {
    mockAuth({ status: "idle" });
    renderProfileScreen();
    fireEvent.click(screen.getByRole("button", { name: /Back to studio/i }));
    expect(window.location.hash).toBe("#survey");
  });
});

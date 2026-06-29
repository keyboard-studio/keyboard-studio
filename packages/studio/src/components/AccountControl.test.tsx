// Tests for AccountControl — the right-aligned NavBar identity control.
//
// useGitHubAuth and useGoogleAuth are mocked at the module boundary (same
// pattern as SignUpPanel.test.tsx). useIdentitySession is NOT mocked directly
// because it is a thin composition with no async side effects — letting it run
// its real logic keeps the tests honest about the derived state.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { AccountControl } from "./AccountControl.tsx";
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

describe("AccountControl — signed out (guest)", () => {
  it("renders a 'Sign in' button when no provider is connected", () => {
    mockAuth({ status: "idle" });
    render(<AccountControl />);
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
  });

  it("does not show provider buttons before the popover is opened", () => {
    mockAuth({ status: "idle" });
    render(<AccountControl />);
    expect(screen.queryByRole("button", { name: /Sign in with GitHub/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Sign in with Google/i })).toBeNull();
  });

  it("reveals 'Sign in with GitHub' and 'Sign in with Google' after clicking Sign in", () => {
    mockAuth({ status: "idle" });
    render(<AccountControl />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByRole("button", { name: /Sign in with GitHub/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Sign in with Google/i })).toBeTruthy();
  });

  it("calls github.connect() when 'Sign in with GitHub' is clicked", () => {
    mockAuth({ status: "idle" });
    render(<AccountControl />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    fireEvent.click(screen.getByRole("button", { name: /Sign in with GitHub/i }));
    expect(connect).toHaveBeenCalledOnce();
  });

  it("calls google.connect() when 'Sign in with Google' is clicked", () => {
    mockAuth({ status: "idle" });
    render(<AccountControl />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    fireEvent.click(screen.getByRole("button", { name: /Sign in with Google/i }));
    expect(googleConnect).toHaveBeenCalledOnce();
  });

  it("closes the popover when the backdrop is clicked", () => {
    mockAuth({ status: "idle" });
    render(<AccountControl />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    const dialog = screen.getByRole("dialog", { name: "Sign in options" });
    // Backdrop is the fixed div immediately before the dialog in the DOM.
    const backdrop = dialog.previousElementSibling as HTMLElement;
    fireEvent.click(backdrop);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("AccountControl — signed in (GitHub)", () => {
  it("renders the user initial in a button when GitHub is connected", () => {
    mockAuth({ status: "connected", login: "octocat" });
    render(<AccountControl />);
    const btn = screen.getByRole("button", { name: /Account: octocat/i });
    expect(btn.textContent).toBe("O");
  });

  it("does not render a 'Sign in' button when signed in", () => {
    mockAuth({ status: "connected", login: "octocat" });
    render(<AccountControl />);
    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
  });

  it("opens a menu showing the display name when the avatar is clicked", () => {
    mockAuth({ status: "connected", login: "octocat" });
    render(<AccountControl />);
    fireEvent.click(screen.getByRole("button", { name: /Account: octocat/i }));
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(screen.getByText("octocat")).toBeTruthy();
  });

  it("calls signOut (both disconnects) when 'Sign out' is clicked", () => {
    mockAuth({ status: "connected", login: "octocat" });
    render(<AccountControl />);
    fireEvent.click(screen.getByRole("button", { name: /Account: octocat/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect(disconnect).toHaveBeenCalledOnce();
    expect(googleDisconnect).toHaveBeenCalledOnce();
  });

  it("closes the menu after signing out", () => {
    mockAuth({ status: "connected", login: "octocat" });
    render(<AccountControl />);
    fireEvent.click(screen.getByRole("button", { name: /Account: octocat/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("treats needs-scope as signed-in (identity established)", () => {
    mockAuth({ status: "needs-scope", login: "octocat" });
    render(<AccountControl />);
    expect(screen.getByRole("button", { name: /Account: octocat/i })).toBeTruthy();
  });
});

describe("AccountControl — verifying state", () => {
  it("renders a neutral placeholder (no Sign in button, no avatar) while verifying", () => {
    mockAuth({ status: "verifying" });
    render(<AccountControl />);
    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Account/i })).toBeNull();
  });
});

describe("AccountControl — error display", () => {
  it("renders github.error text in the guest popover when a GitHub error is present", () => {
    mockAuth({ status: "idle", error: "GitHub sign-in was rejected." });
    render(<AccountControl />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("GitHub sign-in was rejected.")).toBeTruthy();
  });

  it("renders google.error text in the guest popover when a Google error is present", () => {
    mockAuth({}, { status: "error", error: "Google sign-in could not be completed." });
    render(<AccountControl />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Google sign-in could not be completed.")).toBeTruthy();
  });
});

describe("AccountControl — signed in (Google)", () => {
  it("shows the initial from Google name and the display name in the menu", () => {
    mockAuth(
      { status: "idle" },
      {
        status: "connected",
        identity: {
          provider: "google",
          sub: "123",
          email: "tester@example.com",
          emailVerified: true,
          name: "Tester User",
          picture: "",
        },
      },
    );
    render(<AccountControl />);
    const avatarBtn = screen.getByRole("button", { name: /Account: Tester User/i });
    expect(avatarBtn.textContent).toBe("T");
    fireEvent.click(avatarBtn);
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(screen.getByText("Tester User")).toBeTruthy();
  });
});

describe("AccountControl — Profile navigation", () => {
  it("navigates to #profile when the 'Profile' menu item is clicked", () => {
    mockAuth({ status: "connected", login: "octocat" });
    render(<AccountControl />);
    fireEvent.click(screen.getByRole("button", { name: /Account: octocat/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Profile" }));
    expect(window.location.hash).toBe("#profile");
  });
});

describe("AccountControl — keyboard dismissal", () => {
  it("closes the signed-in menu when Escape is pressed", () => {
    mockAuth({ status: "connected", login: "octocat" });
    render(<AccountControl />);
    fireEvent.click(screen.getByRole("button", { name: /Account: octocat/i }));
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes the guest sign-in popover when Escape is pressed", () => {
    mockAuth({ status: "idle" });
    render(<AccountControl />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByRole("dialog", { name: "Sign in options" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

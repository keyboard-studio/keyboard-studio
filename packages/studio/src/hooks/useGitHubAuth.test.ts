// useGitHubAuth — React-state layer over the GitHub OAuth flow.
//
// Coverage goals:
//   1. Rehydrate-from-sessionStorage on mount: a token written before mount is
//      picked up, verifyToken is called with it, and a scoped result → connected.
//   2. needs-scope: oauth_app token + verifyToken returns ok:false / missingScopes
//      → "needs-scope" and canSubmit is false.
//   3. github_app token + verify.ok → "connected" regardless of missingScopes
//      (identity flow sends no scope; missing scopes are expected and irrelevant).
//   3b. github_app token + verify.ok=false → "error" (revoked/invalid token).
//       Must NOT yield "needs-scope" — that would make the user appear linked.
//   4. disconnect() clears the stored token and returns the hook to idle.
//   5. oauth_error pickup: a `?oauth_error=` query param is read into the
//      hook's error state on mount and stripped from the URL.
//   6. canSubmit is true only for oauth_app tokens with required scope.
//
// Approach: the OAuth storage helpers (githubOAuth.ts) run against jsdom's real
// sessionStorage, so we seed/clear it directly. getGitHubOutputService (the
// services boundary) is mocked so verifyToken is a controllable spy and no
// engine/network is touched.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { VerifyTokenResult } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// services mock — verifyToken is a controllable spy.
// ---------------------------------------------------------------------------

const { verifyToken } = vi.hoisted(() => ({
  verifyToken: vi.fn<(token: string) => Promise<VerifyTokenResult>>(),
}));

vi.mock("../lib/services.ts", () => ({
  getGitHubOutputService: vi.fn(async () => ({
    verifyToken,
    publishPR: vi.fn(),
  })),
}));

import { useGitHubAuth } from "./useGitHubAuth.ts";

const TOKEN_KEY = "ks.github.token";

function seedToken(scope = "public_repo", client: "github_app" | "oauth_app" = "github_app"): void {
  sessionStorage.setItem(
    TOKEN_KEY,
    JSON.stringify({ accessToken: "ghp_seeded", tokenType: "bearer", scope, client }),
  );
}

beforeEach(() => {
  sessionStorage.clear();
  // Reset the URL to a clean root so oauth_error tests are isolated.
  window.history.replaceState(null, "", "/");
  verifyToken.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useGitHubAuth — github_app (identity) flow", () => {
  it("github_app token + verify.ok → 'connected' even when missingScopes is non-empty", async () => {
    // GitHub App identity flow sends no scope, so GitHub returns all scopes as
    // missing. The hook must NOT enter needs-scope for a github_app token.
    seedToken("", "github_app");
    verifyToken.mockResolvedValue({
      ok: true,
      login: "octocat",
      scopes: [],
      missingScopes: ["public_repo"],
    });

    const { result } = renderHook(() => useGitHubAuth());
    await waitFor(() => expect(result.current.status).toBe("connected"));
    expect(result.current.login).toBe("octocat");
    // canSubmit is false: github_app token never gates Option A.
    expect(result.current.canSubmit).toBe(false);
  });

  it("github_app token + verify.ok + empty missingScopes → 'connected'", async () => {
    seedToken("user:email", "github_app");
    verifyToken.mockResolvedValue({
      ok: true,
      login: "octocat",
      scopes: ["user:email"],
      missingScopes: [],
    });

    const { result } = renderHook(() => useGitHubAuth());
    await waitFor(() => expect(result.current.status).toBe("connected"));
    expect(result.current.canSubmit).toBe(false);
  });

  it("github_app token + verify.ok=false → 'error' (token revoked/invalid, NOT needs-scope)", async () => {
    // A dead github_app token must yield "error", not "needs-scope".
    // needs-scope is reserved for oauth_app tokens that authenticated but lack
    // public_repo. Returning needs-scope here would make the user appear linked
    // in SignUpPanel / AccountControl (both treat connected|needs-scope as linked).
    seedToken("", "github_app");
    verifyToken.mockResolvedValue({
      ok: false,
      login: "octocat",
      scopes: [],
      missingScopes: ["public_repo"],
    });

    const { result } = renderHook(() => useGitHubAuth());
    await waitFor(() => expect(result.current.status).toBe("error"));
    // canSubmit must be false — a dead token cannot fork+PR.
    expect(result.current.canSubmit).toBe(false);
  });
});

describe("useGitHubAuth — oauth_app (submit) flow", () => {
  it("oauth_app token + no missing scopes → 'connected' + canSubmit true", async () => {
    seedToken("public_repo", "oauth_app");
    verifyToken.mockResolvedValue({
      ok: true,
      login: "octocat",
      scopes: ["public_repo"],
      missingScopes: [],
    });

    const { result } = renderHook(() => useGitHubAuth());
    await waitFor(() => expect(result.current.status).toBe("connected"));
    expect(result.current.canSubmit).toBe(true);
  });

  it("oauth_app token + missing scopes → 'needs-scope' + canSubmit false", async () => {
    seedToken("read:user", "oauth_app");
    verifyToken.mockResolvedValue({
      ok: false,
      login: "octocat",
      scopes: ["read:user"],
      missingScopes: ["public_repo"],
    });

    const { result } = renderHook(() => useGitHubAuth());
    await waitFor(() => expect(result.current.status).toBe("needs-scope"));
    expect(result.current.canSubmit).toBe(false);
    expect(result.current.missingScopes).toEqual(["public_repo"]);
  });
});

describe("useGitHubAuth — general lifecycle", () => {
  it("rehydrates the token from sessionStorage and verifies it on mount", async () => {
    seedToken("public_repo", "oauth_app");
    verifyToken.mockResolvedValue({
      ok: true,
      login: "octocat",
      scopes: ["public_repo"],
      missingScopes: [],
    });

    const { result } = renderHook(() => useGitHubAuth());

    // Token is rehydrated synchronously on mount.
    expect(result.current.token?.accessToken).toBe("ghp_seeded");

    await waitFor(() => expect(result.current.status).toBe("connected"));
    expect(verifyToken).toHaveBeenCalledWith("ghp_seeded");
    expect(result.current.login).toBe("octocat");
  });

  it("disconnect() clears the stored token and returns to idle", async () => {
    seedToken("public_repo", "oauth_app");
    verifyToken.mockResolvedValue({
      ok: true,
      login: "octocat",
      scopes: ["public_repo"],
      missingScopes: [],
    });

    const { result } = renderHook(() => useGitHubAuth());
    await waitFor(() => expect(result.current.status).toBe("connected"));

    act(() => {
      result.current.disconnect();
    });

    expect(result.current.token).toBeNull();
    expect(result.current.status).toBe("idle");
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it("maps a ?oauth_error= reason code to a static message on mount and strips it from the URL", async () => {
    // The boot-time handler carries the safe `reason` enum, not raw backend text.
    window.history.replaceState(null, "", "/?oauth_error=exchange-failed");

    const { result } = renderHook(() => useGitHubAuth());

    await waitFor(() =>
      expect(result.current.error).toBe(
        "GitHub sign-in could not be completed. Please try connecting again.",
      ),
    );
    // The param is stripped so a refresh does not re-surface it.
    expect(window.location.search).toBe("");
  });

  it("falls back to a generic message for an unknown ?oauth_error= code", async () => {
    window.history.replaceState(null, "", "/?oauth_error=totally-bogus");

    const { result } = renderHook(() => useGitHubAuth());

    await waitFor(() =>
      expect(result.current.error).toBe(
        "GitHub sign-in could not be completed. Please try connecting again.",
      ),
    );
    expect(window.location.search).toBe("");
  });
});

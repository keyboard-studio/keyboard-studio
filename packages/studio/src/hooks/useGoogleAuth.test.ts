// useGoogleAuth — React-state layer over the Google OAuth identity flow.
//
// Coverage goals:
//   1. Rehydrate-from-sessionStorage on mount: an identity written before mount
//      is picked up via the single readGoogleAuthInit initializer; absent →
//      status "idle", present → "connected".
//   2. connect() happy path → calls window.location.assign with a Google
//      authorize URL (https://accounts.google.com/o/oauth2/v2/auth, scope
//      openid profile email, code_challenge_method S256).
//   3. connect() failure → status becomes "error", error message set.
//   4. disconnect() → clears the ks.google.* identity, status returns to "idle".
//   5. consumeGoogleOAuthErrorParam: ?google_oauth_error=<reason> present →
//      maps to a message and strips the param via replaceState; empty/absent →
//      no-op.
//
// Approach: the Google storage helpers (googleOAuth.ts) run against jsdom's
// real sessionStorage, so we seed/clear it directly. beginGoogleAuthorize is
// mocked so no PKCE or window.location.assign side effects reach production
// code during unit tests.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// ---------------------------------------------------------------------------
// beginGoogleAuthorize mock — controllable spy; isolates the PKCE + redirect
// side effects from the hook's connect() logic, mirroring how useGitHubAuth
// tests mock the GitHub services boundary.
// ---------------------------------------------------------------------------

const { beginGoogleAuthorize } = vi.hoisted(() => ({
  beginGoogleAuthorize: vi.fn<[], Promise<string>>(),
}));

vi.mock("../lib/googleOAuth.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/googleOAuth.ts")>();
  return {
    ...original,
    beginGoogleAuthorize,
  };
});

import { useGoogleAuth } from "./useGoogleAuth.ts";
import { setStoredGoogleIdentity } from "../lib/googleOAuth.ts";

const IDENTITY_KEY = "ks.google.identity";
const VERIFIER_KEY = "ks.google.oauth.verifier";
const STATE_KEY = "ks.google.oauth.state";

/** Seed a valid Google identity into sessionStorage before mount. */
function seedIdentity(): void {
  setStoredGoogleIdentity({
    sub: "123456789",
    email: "user@example.com",
    emailVerified: true,
    name: "Test User",
    picture: "https://example.com/photo.jpg",
  });
}

beforeEach(() => {
  sessionStorage.clear();
  // Reset the URL so google_oauth_error tests are isolated.
  window.history.replaceState(null, "", "/");
  beginGoogleAuthorize.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useGoogleAuth", () => {
  describe("rehydrate-from-sessionStorage on mount", () => {
    it("status is 'connected' and identity is present when sessionStorage has an identity", () => {
      seedIdentity();

      const { result } = renderHook(() => useGoogleAuth());

      // Synchronous initializer: identity is read before the first render.
      expect(result.current.status).toBe("connected");
      expect(result.current.identity).not.toBeNull();
      expect(result.current.identity?.sub).toBe("123456789");
      expect(result.current.identity?.email).toBe("user@example.com");
      expect(result.current.identity?.name).toBe("Test User");
    });

    it("status is 'idle' and identity is null when sessionStorage has no identity", () => {
      // sessionStorage is already empty from beforeEach.
      const { result } = renderHook(() => useGoogleAuth());

      expect(result.current.status).toBe("idle");
      expect(result.current.identity).toBeNull();
    });
  });

  describe("connect()", () => {
    it("calls window.location.assign with a Google authorize URL on success", async () => {
      const googleUrl =
        "https://accounts.google.com/o/oauth2/v2/auth?client_id=test&scope=openid+profile+email&code_challenge_method=S256&state=random-state&code_challenge=challenge&redirect_uri=http%3A%2F%2Flocalhost%2Foauth%2Fgoogle%2Fcallback&response_type=code";
      beginGoogleAuthorize.mockResolvedValue(googleUrl);

      // jsdom disallows redefining window.location.assign via spyOn.
      // Use vi.stubGlobal so vitest restores the original after the test,
      // keeping window.location intact for subsequent tests.
      const assignMock = vi.fn();
      vi.stubGlobal("location", { ...window.location, assign: assignMock });

      const { result } = renderHook(() => useGoogleAuth());

      await act(async () => {
        await result.current.connect();
      });

      expect(beginGoogleAuthorize).toHaveBeenCalledOnce();
      expect(assignMock).toHaveBeenCalledOnce();
      const assignedUrl = assignMock.mock.calls[0]?.[0] as string;
      expect(assignedUrl).toContain("accounts.google.com/o/oauth2/v2/auth");

      vi.unstubAllGlobals();
    });

    it("sets status to 'error' and populates error when beginGoogleAuthorize throws", async () => {
      beginGoogleAuthorize.mockRejectedValue(
        new Error("Google OAuth is not configured (VITE_GOOGLE_CLIENT_ID is empty)."),
      );

      const { result } = renderHook(() => useGoogleAuth());

      await act(async () => {
        await result.current.connect();
      });

      expect(result.current.status).toBe("error");
      expect(result.current.error).toContain("Google OAuth is not configured");
    });
  });

  describe("disconnect()", () => {
    it("clears the identity and returns status to 'idle'", async () => {
      seedIdentity();
      // Also plant a verifier and state to confirm they are cleared.
      sessionStorage.setItem(VERIFIER_KEY, "verifier-to-clear");
      sessionStorage.setItem(STATE_KEY, "state-to-clear");

      const { result } = renderHook(() => useGoogleAuth());
      expect(result.current.status).toBe("connected");

      act(() => {
        result.current.disconnect();
      });

      expect(result.current.identity).toBeNull();
      expect(result.current.status).toBe("idle");
      expect(result.current.error).toBeNull();
      // sessionStorage identity key must be gone.
      expect(sessionStorage.getItem(IDENTITY_KEY)).toBeNull();
      // OAuth scratch keys must also be cleared.
      expect(sessionStorage.getItem(VERIFIER_KEY)).toBeNull();
      expect(sessionStorage.getItem(STATE_KEY)).toBeNull();
    });
  });

  describe("consumeGoogleOAuthErrorParam", () => {
    it("maps a known ?google_oauth_error= reason to a user-facing message on mount and strips the param", async () => {
      window.history.replaceState(null, "", "/?google_oauth_error=exchange-failed");

      const { result } = renderHook(() => useGoogleAuth());

      await waitFor(() =>
        expect(result.current.error).toBe(
          "Google sign-in could not be completed. Please try connecting again.",
        ),
      );
      // The param is stripped so a refresh does not re-surface it.
      expect(window.location.search).toBe("");
    });

    it("maps 'state-mismatch' to its specific user-facing message", async () => {
      window.history.replaceState(null, "", "/?google_oauth_error=state-mismatch");

      const { result } = renderHook(() => useGoogleAuth());

      await waitFor(() =>
        expect(result.current.error).toBe(
          "Google sign-in was rejected for security reasons. Please try connecting again.",
        ),
      );
      expect(window.location.search).toBe("");
    });

    it("maps 'missing-code' to its specific user-facing message", async () => {
      window.history.replaceState(null, "", "/?google_oauth_error=missing-code");

      const { result } = renderHook(() => useGoogleAuth());

      await waitFor(() =>
        expect(result.current.error).toBe(
          "Google did not return an authorization code. Please try connecting again.",
        ),
      );
      expect(window.location.search).toBe("");
    });

    it("falls back to the generic message for an unknown ?google_oauth_error= code", async () => {
      window.history.replaceState(null, "", "/?google_oauth_error=totally-bogus");

      const { result } = renderHook(() => useGoogleAuth());

      await waitFor(() =>
        expect(result.current.error).toBe(
          "Google sign-in could not be completed. Please try connecting again.",
        ),
      );
      expect(window.location.search).toBe("");
    });

    it("does not set an error when ?google_oauth_error= is absent", async () => {
      // URL has no google_oauth_error param.
      const { result } = renderHook(() => useGoogleAuth());

      // Give effects a chance to fire.
      await act(async () => {});

      expect(result.current.error).toBeNull();
    });

    it("does not set an error when ?google_oauth_error= is an empty string", async () => {
      window.history.replaceState(null, "", "/?google_oauth_error=");

      const { result } = renderHook(() => useGoogleAuth());

      await act(async () => {});

      // Empty string maps to null in consumeGoogleOAuthErrorParam.
      expect(result.current.error).toBeNull();
      // The param is still stripped from the URL.
      expect(window.location.search).toBe("");
    });

    it("strips only the google_oauth_error param, preserving other params", async () => {
      window.history.replaceState(null, "", "/?other=keep&google_oauth_error=exchange-failed");

      const { result } = renderHook(() => useGoogleAuth());

      await waitFor(() => expect(result.current.error).not.toBeNull());
      // The other param must survive.
      expect(window.location.search).toContain("other=keep");
      expect(window.location.search).not.toContain("google_oauth_error");
    });
  });
});

// useGitHubAuth — React state owner for the GitHub OAuth connection.
//
// Owns: connect (begin the PKCE authorize redirect), disconnect (clear token +
// scratch), the stored token, and the verifyToken result that gates the
// "Submit PR" button. The pure flow lives in lib/githubOAuth.ts; this hook is
// the thin React layer over it.
//
// The token lives in sessionStorage (tab-scoped). On mount the hook rehydrates
// from sessionStorage and re-verifies, so a token captured by the boot-time
// /oauth/callback handler is picked up on the next render.

import { useCallback, useEffect, useState } from "react";
import type { VerifyTokenResult } from "@keyboard-studio/contracts";
import {
  beginAuthorize,
  clearOAuthScratch,
  clearStoredToken,
  getStoredToken,
  hasRequiredScope,
  type StoredGitHubToken,
} from "../lib/githubOAuth.ts";
import { getGitHubOutputService } from "../lib/services.ts";
import type { OAuthCallbackFailureReason } from "../lib/handleOAuthCallback.ts";
import { snapshotWorkingCopyToSession } from "../lib/persistWorkingCopy.ts";

/**
 * Static, user-facing copy for each OAuth-callback failure reason. The boot-time
 * handler carries the safe `reason` enum in `?oauth_error=` — never the raw
 * backend message — so the only thing ever surfaced is one of these fixed
 * strings, mapped here. Unknown / malformed codes fall back to {@link
 * GENERIC_OAUTH_ERROR}.
 */
const OAUTH_ERROR_MESSAGES: Record<OAuthCallbackFailureReason, string> = {
  "state-mismatch":
    "GitHub sign-in was rejected for security reasons. Please try connecting again.",
  "missing-code": "GitHub did not return an authorization code. Please try connecting again.",
  "missing-verifier":
    "Your GitHub sign-in session expired before it completed. Please try connecting again.",
  "exchange-failed": "GitHub sign-in could not be completed. Please try connecting again.",
};

const GENERIC_OAUTH_ERROR = "GitHub sign-in could not be completed. Please try connecting again.";

/**
 * Read a `?oauth_error=` param left by the boot-time OAuth callback handler
 * (handleOAuthCallback redirects to `/?oauth_error=<reason>` on a failed /
 * denied round-trip) and strip it from the URL so a refresh does not re-show it.
 *
 * The param value is a safe {@link OAuthCallbackFailureReason} code, which we map
 * to a static user-facing string — no backend-sourced text is ever rendered.
 * Returns the message, or null if absent. Strips the param via
 * history.replaceState (no navigation, no host-disk write). Browser-only; guards
 * against non-browser / missing-history environments so the hook stays testable.
 */
function consumeOAuthErrorParam(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const oauthError = params.get("oauth_error");
  if (oauthError === null) return null;

  // Strip the param so a refresh does not re-surface the stale error.
  params.delete("oauth_error");
  const query = params.toString();
  const newUrl =
    window.location.pathname + (query === "" ? "" : `?${query}`) + window.location.hash;
  window.history.replaceState(window.history.state, "", newUrl);

  if (oauthError === "") return null;
  return (
    OAUTH_ERROR_MESSAGES[oauthError as OAuthCallbackFailureReason] ?? GENERIC_OAUTH_ERROR
  );
}

/** Connection lifecycle for the GitHub OAuth integration. */
export type GitHubAuthStatus =
  | "idle" // no token
  | "verifying" // token present, verifyToken in flight
  | "connected" // token verified with required scope
  | "needs-scope" // token verified but missing public_repo
  | "error"; // verify failed (network / invalid token)

export interface UseGitHubAuthResult {
  status: GitHubAuthStatus;
  /** The stored token bundle, or null. */
  token: StoredGitHubToken | null;
  /** Latest verifyToken result, or null if not yet verified. */
  verify: VerifyTokenResult | null;
  /** GitHub login from verifyToken (the fork owner), or null. */
  login: string | null;
  /** True when a valid token with `public_repo` is present (gates Submit PR). */
  canSubmit: boolean;
  /** Scopes still missing for fork+PR (e.g. ["public_repo"]). */
  missingScopes: readonly string[];
  /** Human-readable error from the verify step, or null. */
  error: string | null;
  /**
   * Begin the OAuth PKCE flow — redirects the tab to GitHub. Defaults to the
   * identity (sign-up) scope; pass {@link REQUIRED_SCOPE} only for the explicit
   * self-fork submit opt-in (docs/github-integration.md §1a).
   */
  connect: (scope?: string) => Promise<void>;
  /** Clear the token + any OAuth scratch state. */
  disconnect: () => void;
}

export function useGitHubAuth(): UseGitHubAuthResult {
  const [token, setToken] = useState<StoredGitHubToken | null>(() => getStoredToken());
  const [verify, setVerify] = useState<VerifyTokenResult | null>(null);
  const [status, setStatus] = useState<GitHubAuthStatus>(() =>
    getStoredToken() === null ? "idle" : "verifying",
  );
  const [error, setError] = useState<string | null>(null);

  // On mount, pick up any `?oauth_error=` left by the boot-time OAuth callback
  // handler and surface it as the initial visible error, then strip it from the
  // URL. Empty deps → runs once. The token-verify effect below clears `error`
  // when a token IS present, so this only persists on the no-token (failed/denied)
  // path — exactly the case where the user is staring at a bare Connect button.
  useEffect(() => {
    const oauthError = consumeOAuthErrorParam();
    if (oauthError !== null) {
      setError(oauthError);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Verify the token whenever it changes (and on mount if rehydrated).
  useEffect(() => {
    if (token === null) {
      setStatus("idle");
      setVerify(null);
      // NOTE: do NOT clear `error` here. On mount with no token this branch runs
      // after the oauth-error pickup effect, and an `?oauth_error=` message must
      // survive on the no-token path. `error` is cleared explicitly by connect()
      // and disconnect() instead.
      return;
    }
    let cancelled = false;
    setStatus("verifying");
    setError(null);
    void (async () => {
      try {
        const svc = await getGitHubOutputService();
        const result = await svc.verifyToken(token.accessToken);
        if (cancelled) return;
        setVerify(result);
        if (result.ok && result.missingScopes.length === 0) {
          setStatus("connected");
        } else {
          setStatus("needs-scope");
        }
      } catch (err: unknown) {
        if (cancelled) return;
        setVerify(null);
        setStatus("error");
        setError(err instanceof Error ? err.message : "Failed to verify GitHub token.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const connect = useCallback(async (scope?: string) => {
    setError(null);
    try {
      const url = await beginAuthorize(scope);
      snapshotWorkingCopyToSession();
      window.location.assign(url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to start GitHub sign-in.");
      setStatus("error");
    }
  }, []);

  const disconnect = useCallback(() => {
    clearStoredToken();
    clearOAuthScratch();
    setToken(null);
    setVerify(null);
    setStatus("idle");
    setError(null);
  }, []);

  return {
    status,
    token,
    verify,
    login: verify?.login ?? null,
    canSubmit: hasRequiredScope(verify),
    missingScopes: verify?.missingScopes ?? [],
    error,
    connect,
    disconnect,
  };
}

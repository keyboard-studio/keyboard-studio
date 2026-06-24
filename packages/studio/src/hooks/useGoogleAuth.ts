// useGoogleAuth — React state owner for the Google OAuth identity connection.
//
// Mirrors the structure of useGitHubAuth.ts but for the Google identity-only
// flow. Google = STATELESS identity-only session. No account store. Lives in
// sessionStorage like the GitHub token.
//
// The identity session is stored in sessionStorage (tab-scoped). On mount the
// hook rehydrates from sessionStorage so identity captured by the boot-time
// /oauth/google/callback handler is picked up on the next render.

import { useCallback, useEffect, useState } from "react";
import {
  beginGoogleAuthorize,
  clearGoogleOAuthScratch,
  clearStoredGoogleIdentity,
  getStoredGoogleIdentity,
  toGoogleIdentitySession,
  type StoredGoogleIdentity,
} from "../lib/googleOAuth.ts";
import type { GoogleIdentitySession } from "../lib/identity.ts";
import type { OAuthCallbackFailureReason } from "../lib/handleOAuthCallback.ts";

/**
 * Static, user-facing copy for each Google OAuth-callback failure reason.
 * Typed against OAuthCallbackFailureReason for exhaustiveness — mirrors
 * the pattern in useGitHubAuth.
 */
const GOOGLE_OAUTH_ERROR_MESSAGES: Record<OAuthCallbackFailureReason, string> = {
  "state-mismatch":
    "Google sign-in was rejected for security reasons. Please try connecting again.",
  "missing-code": "Google did not return an authorization code. Please try connecting again.",
  "missing-verifier":
    "Your Google sign-in session expired before it completed. Please try connecting again.",
  "exchange-failed": "Google sign-in could not be completed. Please try connecting again.",
};

const GENERIC_GOOGLE_OAUTH_ERROR =
  "Google sign-in could not be completed. Please try connecting again.";

/**
 * Read a `?google_oauth_error=` param left by the boot-time Google callback
 * handler and strip it from the URL so a refresh does not re-show it.
 * Returns the mapped user-facing message, or null if absent.
 */
function consumeGoogleOAuthErrorParam(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const oauthError = params.get("google_oauth_error");
  if (oauthError === null) return null;

  params.delete("google_oauth_error");
  const query = params.toString();
  const newUrl =
    window.location.pathname + (query === "" ? "" : `?${query}`) + window.location.hash;
  window.history.replaceState(window.history.state, "", newUrl);

  if (oauthError === "") return null;
  return GOOGLE_OAUTH_ERROR_MESSAGES[oauthError as OAuthCallbackFailureReason] ?? GENERIC_GOOGLE_OAUTH_ERROR;
}

/** Connection lifecycle for the Google OAuth identity integration. */
export type GoogleAuthStatus =
  | "idle" // no identity stored
  | "connected" // identity present and rehydrated
  | "error"; // connect failed

export interface UseGoogleAuthResult {
  status: GoogleAuthStatus;
  /** The stored Google identity session, or null. */
  identity: GoogleIdentitySession | null;
  /** Human-readable error, or null. */
  error: string | null;
  /** Begin the Google OAuth PKCE flow — redirects the tab to Google. */
  connect: () => Promise<void>;
  /** Clear the identity + any OAuth scratch state. */
  disconnect: () => void;
}

interface GoogleAuthInit {
  identity: StoredGoogleIdentity | null;
  status: GoogleAuthStatus;
}

function readGoogleAuthInit(): GoogleAuthInit {
  const initial = getStoredGoogleIdentity();
  return { identity: initial, status: initial === null ? "idle" : "connected" };
}

export function useGoogleAuth(): UseGoogleAuthResult {
  // Read sessionStorage once; derive both identity and status from `initial`
  // so the two atoms are always consistent at mount. Mirrors useGitHubAuth.
  const [{ identity: storedIdentity, status }, setInit] = useState<GoogleAuthInit>(
    readGoogleAuthInit,
  );
  const [error, setError] = useState<string | null>(null);

  const setStoredIdentity = useCallback(
    (v: StoredGoogleIdentity | null) => setInit((prev) => ({ ...prev, identity: v })),
    [],
  );
  const setStatus = useCallback(
    (s: GoogleAuthStatus) => setInit((prev) => ({ ...prev, status: s })),
    [],
  );

  // On mount, pick up any `?google_oauth_error=` left by the boot-time Google
  // callback handler and surface it as the initial visible error, then strip
  // it from the URL. Mirrors the github oauth_error pickup in useGitHubAuth.
  useEffect(() => {
    const oauthError = consumeGoogleOAuthErrorParam();
    if (oauthError !== null) {
      setError(oauthError);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    try {
      const url = await beginGoogleAuthorize();
      window.location.assign(url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to start Google sign-in.");
      setStatus("error");
    }
  }, [setStatus]);

  const disconnect = useCallback(() => {
    clearStoredGoogleIdentity();
    clearGoogleOAuthScratch();
    setStoredIdentity(null);
    setStatus("idle");
    setError(null);
  }, [setStoredIdentity, setStatus]);

  const identity =
    storedIdentity !== null ? toGoogleIdentitySession(storedIdentity) : null;

  return {
    status,
    identity,
    error,
    connect,
    disconnect,
  };
}

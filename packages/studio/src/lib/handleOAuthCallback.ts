// handleOAuthCallback — boot-time handler for OAuth redirects (GitHub + Google).
//
// The studio uses hash-based routing (StudioShell.useRoute), so there is no
// path router to register callback paths with. Instead main.tsx checks the
// pathname at boot and, if matched, runs the appropriate handler BEFORE
// rendering the app.
//
// GitHub flow (spec §12 "Option A", PKCE web-app flow):
//   1. Read `code` + `state` from the query string.
//   2. Validate `state` against the value persisted before the redirect
//      (reject mismatch — CSRF defence).
//   3. POST { code, code_verifier, redirect_uri } to the OAuth backend.
//   4. Store the returned token in sessionStorage (tab-scoped).
//   5. Clear the OAuth scratch state.
//   6. Redirect back to the app root so the SPA boots normally and
//      useGitHubAuth rehydrates + verifies the token.
//
// Google flow (identity-only):
//   Same structure as GitHub, but POSTs to /oauth/google/exchange and stores
//   identity claims (not a token). On failure carries `google_oauth_error=`.
//
// Browser-only.

import {
  clearOAuthScratch,
  exchangeCode,
  getStoredState,
  getStoredVerifier,
  setStoredToken,
} from "./githubOAuth.ts";
import {
  clearGoogleOAuthScratch,
  exchangeGoogleCode,
  getGoogleStoredState,
  getGoogleStoredVerifier,
  setStoredGoogleIdentity,
} from "./googleOAuth.ts";

/** The GitHub OAuth redirect path. Must match getRedirectUri() in githubOAuth.ts. */
export const OAUTH_CALLBACK_PATH = "/oauth/callback";

/** The Google OAuth redirect path. Must match getGoogleRedirectUri() in googleOAuth.ts. */
export const GOOGLE_OAUTH_CALLBACK_PATH = "/oauth/google/callback";

/**
 * Why a callback failed. A short, fixed, URL-safe enum — NOT free text. The
 * boot-time handler carries this (not the raw `message`) across the redirect in
 * `?oauth_error=`, and useGitHubAuth maps it to a static user-facing string, so
 * no backend-sourced text is ever interpolated into the URL or rendered.
 */
export type OAuthCallbackFailureReason =
  | "state-mismatch"
  | "missing-code"
  | "missing-verifier"
  | "exchange-failed";

/** Outcome of the callback handler (for tests + caller logging). */
export type OAuthCallbackResult =
  | { ok: true }
  | { ok: false; reason: OAuthCallbackFailureReason; message: string };

/**
 * Process the OAuth callback query params. Pure of routing side effects except
 * the sessionStorage writes — the caller decides whether/where to redirect.
 *
 * @param search - the `window.location.search` string (e.g. "?code=...&state=...").
 */
export async function processOAuthCallback(search: string): Promise<OAuthCallbackResult> {
  const params = new URLSearchParams(search);
  const code = params.get("code");
  const returnedState = params.get("state");
  const oauthError = params.get("error");

  // GitHub can redirect back with an error (e.g. the user denied access).
  if (oauthError !== null) {
    clearOAuthScratch();
    return { ok: false, reason: "exchange-failed", message: oauthError };
  }

  if (code === null || code === "") {
    return { ok: false, reason: "missing-code", message: "No authorization code in callback." };
  }

  const storedState = getStoredState();
  // Validate state — reject if missing or mismatched (CSRF defence).
  if (storedState === null || returnedState === null || returnedState !== storedState) {
    clearOAuthScratch();
    return {
      ok: false,
      reason: "state-mismatch",
      message: "OAuth state mismatch — possible CSRF; sign-in rejected.",
    };
  }

  const verifier = getStoredVerifier();
  if (verifier === null) {
    clearOAuthScratch();
    return { ok: false, reason: "missing-verifier", message: "Missing PKCE verifier." };
  }

  try {
    const token = await exchangeCode(code, verifier);
    setStoredToken(token);
    clearOAuthScratch();
    return { ok: true };
  } catch (err: unknown) {
    clearOAuthScratch();
    return {
      ok: false,
      reason: "exchange-failed",
      message: err instanceof Error ? err.message : "Token exchange failed.",
    };
  }
}

/**
 * Boot-time entry point for the GitHub OAuth callback. When the current
 * pathname is the GitHub OAuth callback, processes the handshake and then
 * redirects to the app root. On failure it carries the safe `reason` enum
 * (NOT the raw backend `message`) in `?oauth_error=`, which useGitHubAuth
 * maps to a static user-facing string — so no backend-sourced text is
 * interpolated into the URL. Returns true if it handled (i.e. the caller
 * should NOT render the app this tick).
 */
export async function runOAuthCallbackIfPresent(): Promise<boolean> {
  const pathname = window.location.pathname;

  if (pathname === GOOGLE_OAUTH_CALLBACK_PATH) {
    const result = await processGoogleOAuthCallback(window.location.search);
    const target = result.ok
      ? "/"
      : `/?google_oauth_error=${encodeURIComponent(result.reason)}`;
    window.location.replace(target);
    return true;
  }

  if (pathname !== OAUTH_CALLBACK_PATH) {
    return false;
  }
  const result = await processOAuthCallback(window.location.search);
  const target = result.ok
    ? "/"
    : `/?oauth_error=${encodeURIComponent(result.reason)}`;
  window.location.replace(target);
  return true;
}

// ---------------------------------------------------------------------------
// Google OAuth callback
// ---------------------------------------------------------------------------

/**
 * Process the Google OAuth callback query params. Pure of routing side effects
 * except the sessionStorage writes — the caller decides whether/where to redirect.
 *
 * @param search - the `window.location.search` string (e.g. "?code=...&state=...").
 */
export async function processGoogleOAuthCallback(
  search: string,
): Promise<OAuthCallbackResult> {
  const params = new URLSearchParams(search);
  const code = params.get("code");
  const returnedState = params.get("state");
  const oauthError = params.get("error");

  // Google can redirect back with an error (e.g. the user denied access).
  if (oauthError !== null) {
    clearGoogleOAuthScratch();
    return { ok: false, reason: "exchange-failed", message: oauthError };
  }

  if (code === null || code === "") {
    return { ok: false, reason: "missing-code", message: "No authorization code in Google callback." };
  }

  const storedState = getGoogleStoredState();
  // Validate state — reject if missing or mismatched (CSRF defence).
  if (storedState === null || returnedState === null || returnedState !== storedState) {
    clearGoogleOAuthScratch();
    return {
      ok: false,
      reason: "state-mismatch",
      message: "Google OAuth state mismatch — possible CSRF; sign-in rejected.",
    };
  }

  const verifier = getGoogleStoredVerifier();
  if (verifier === null) {
    clearGoogleOAuthScratch();
    return { ok: false, reason: "missing-verifier", message: "Missing PKCE verifier for Google." };
  }

  try {
    const identity = await exchangeGoogleCode(code, verifier);
    setStoredGoogleIdentity(identity);
    clearGoogleOAuthScratch();
    return { ok: true };
  } catch (err: unknown) {
    clearGoogleOAuthScratch();
    return {
      ok: false,
      reason: "exchange-failed",
      message: err instanceof Error ? err.message : "Google identity exchange failed.",
    };
  }
}

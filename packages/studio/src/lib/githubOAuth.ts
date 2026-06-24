// githubOAuth — GitHub OAuth (web application flow with PKCE) helpers.
//
// Delivery "Option A" (spec §12 / docs/github_flow.md): the studio drives the
// user through GitHub's OAuth authorize → callback → token-exchange handshake,
// then uses the resulting token (with `public_repo` scope) to fork
// keymanapp/keyboards, push a branch, and open a draft PR.
//
// This module is the PURE, browser-only edge of that flow — no React. It owns:
//   - PKCE pair generation (code_verifier + S256 code_challenge)
//   - the authorize-URL builder
//   - the token-exchange call to the OAuth backend (issue #63)
//   - the sessionStorage token store + the sessionStorage OAuth "scratch" state
//
// Security contract:
//   - The client SECRET never appears here — the code→token exchange goes
//     through the OAuth backend, which holds the secret server-side.
//   - PKCE is used so an intercepted authorization code is useless without the
//     code_verifier (which never leaves this browser tab).
//   - The token is stored in sessionStorage (TAB-scoped, cleared on tab close),
//     never localStorage.
//   - `state` is validated on the callback to defeat CSRF.
//
// Browser-only: uses crypto.subtle / crypto.getRandomValues / crypto.randomUUID;
// no node:* imports.

import type { VerifyTokenResult } from "@keyboard-studio/contracts";
import { generatePkce } from "./pkce.ts";

// Re-export PKCE helpers from the shared module so existing imports are
// unbroken (githubOAuth.test.ts imports them directly from here).
export { computeS256Challenge, generatePkce } from "./pkce.ts";
export type { PkcePair } from "./pkce.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** GitHub's OAuth authorize endpoint. */
const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";

/** The only scope the fork+PR path needs (spec §12). */
export const REQUIRED_SCOPE = "public_repo";

/** sessionStorage keys. Namespaced so they never collide with other state. */
const TOKEN_KEY = "ks.github.token";
const VERIFIER_KEY = "ks.github.oauth.verifier";
const STATE_KEY = "ks.github.oauth.state";

// ---------------------------------------------------------------------------
// Config (read from import.meta.env, see vite-env.d.ts)
// ---------------------------------------------------------------------------

/** OAuth web-app client id (public; safe to ship in the browser). */
export function getClientId(): string {
  return import.meta.env.VITE_GITHUB_CLIENT_ID ?? "";
}

/**
 * Base URL of the OAuth backend (issue #63). Defaults to same-origin ("") so
 * requests hit `/oauth/exchange` on the page's own host (Vercel co-located
 * serverless functions — see MEMORY deployment note).
 */
export function getBackendUrl(): string {
  return import.meta.env.VITE_OAUTH_BACKEND_URL ?? "";
}

/** The redirect URI registered with the OAuth app. Path-based, not hash-based. */
export function getRedirectUri(): string {
  return `${window.location.origin}/oauth/callback`;
}

// ---------------------------------------------------------------------------
// Stored token type
// ---------------------------------------------------------------------------

/** The token bundle persisted in sessionStorage after a successful exchange. */
export interface StoredGitHubToken {
  /** GitHub OAuth access token. */
  accessToken: string;
  /** Token type (typically "bearer"). */
  tokenType: string;
  /** Space-delimited granted scopes, as returned by the backend. */
  scope: string;
  /** Optional refresh token (only with GitHub Apps / expiring tokens). */
  refreshToken?: string;
}


// ---------------------------------------------------------------------------
// Authorize URL
// ---------------------------------------------------------------------------

/** Inputs to {@link buildAuthorizeUrl}. */
export interface BuildAuthorizeUrlInput {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  /** Defaults to {@link REQUIRED_SCOPE}. */
  scope?: string;
}

/**
 * Build the GitHub authorize URL for the PKCE web-app flow.
 *
 * Pure — does not redirect. The caller persists verifier+state, then assigns
 * the returned URL to window.location.
 */
export function buildAuthorizeUrl(input: BuildAuthorizeUrlInput): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    scope: input.scope ?? REQUIRED_SCOPE,
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
  });
  return `${GITHUB_AUTHORIZE_URL}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// OAuth scratch state (verifier + state) — sessionStorage, cleared after use
// ---------------------------------------------------------------------------

/** Persist the PKCE verifier + CSRF state across the GitHub redirect. */
export function setOAuthScratch(verifier: string, state: string): void {
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);
}

/** Read the stored PKCE verifier (null if absent). */
export function getStoredVerifier(): string | null {
  return sessionStorage.getItem(VERIFIER_KEY);
}

/** Read the stored CSRF state (null if absent). */
export function getStoredState(): string | null {
  return sessionStorage.getItem(STATE_KEY);
}

/** Clear the PKCE verifier + CSRF state (call once consumed). */
export function clearOAuthScratch(): void {
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
}

// ---------------------------------------------------------------------------
// Token store (sessionStorage — tab-scoped, NEVER localStorage)
// ---------------------------------------------------------------------------

/** Persist the exchanged token bundle in sessionStorage. */
export function setStoredToken(token: StoredGitHubToken): void {
  sessionStorage.setItem(TOKEN_KEY, JSON.stringify(token));
}

/** Read the stored token bundle, or null if none / unparseable. */
export function getStoredToken(): StoredGitHubToken | null {
  const raw = sessionStorage.getItem(TOKEN_KEY);
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredGitHubToken>;
    if (typeof parsed.accessToken !== "string") return null;
    return {
      accessToken: parsed.accessToken,
      tokenType: typeof parsed.tokenType === "string" ? parsed.tokenType : "bearer",
      scope: typeof parsed.scope === "string" ? parsed.scope : "",
      ...(typeof parsed.refreshToken === "string"
        ? { refreshToken: parsed.refreshToken }
        : {}),
    };
  } catch {
    return null;
  }
}

/** Clear the stored token (Disconnect). */
export function clearStoredToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

// ---------------------------------------------------------------------------
// Connect — build PKCE + state, persist scratch, return the authorize URL
// ---------------------------------------------------------------------------

/**
 * Begin the OAuth flow: generate PKCE + state, persist the scratch state, and
 * return the GitHub authorize URL. The caller assigns it to window.location.
 *
 * Throws if VITE_GITHUB_CLIENT_ID is not configured.
 */
export async function beginAuthorize(): Promise<string> {
  const clientId = getClientId();
  if (clientId === "") {
    throw new Error(
      "GitHub OAuth is not configured (VITE_GITHUB_CLIENT_ID is empty).",
    );
  }
  const { verifier, challenge } = await generatePkce();
  const state = crypto.randomUUID();
  setOAuthScratch(verifier, state);
  return buildAuthorizeUrl({
    clientId,
    redirectUri: getRedirectUri(),
    state,
    codeChallenge: challenge,
  });
}

// ---------------------------------------------------------------------------
// Token exchange (via the OAuth backend — secret stays server-side)
// ---------------------------------------------------------------------------

/** Raw token shape the backend returns on success. */
interface BackendTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  refresh_token?: string;
}

/** A typed error from the token-exchange step. */
export class OAuthExchangeError extends Error {
  /** Safe backend error code (e.g. "bad_verification_code", "access_denied"). */
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "OAuthExchangeError";
    this.code = code;
  }
}

/**
 * Exchange an authorization `code` for an access token via the OAuth backend.
 *
 * POSTs `{ code, code_verifier, redirect_uri }` to `${backend}/oauth/exchange`.
 * On a non-2xx response, throws an {@link OAuthExchangeError} carrying the
 * backend's safe `error` code.
 *
 * @param code - The `code` query param GitHub appended to the callback URL.
 * @param codeVerifier - The PKCE verifier persisted before the redirect.
 */
export async function exchangeCode(
  code: string,
  codeVerifier: string,
): Promise<StoredGitHubToken> {
  const url = `${getBackendUrl()}/oauth/exchange`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code,
        code_verifier: codeVerifier,
        redirect_uri: getRedirectUri(),
      }),
    });
  } catch {
    throw new OAuthExchangeError("network", "Network error during token exchange.");
  }

  if (!res.ok) {
    let errorCode = "github_error";
    try {
      const body = (await res.json()) as { error?: unknown };
      if (typeof body.error === "string") errorCode = body.error;
    } catch {
      // non-JSON error body — keep the default code
    }
    throw new OAuthExchangeError(errorCode, `Token exchange failed: ${errorCode}`);
  }

  const data = (await res.json()) as BackendTokenResponse;
  return {
    accessToken: data.access_token,
    tokenType: data.token_type,
    scope: data.scope,
    ...(typeof data.refresh_token === "string"
      ? { refreshToken: data.refresh_token }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Scope helpers
// ---------------------------------------------------------------------------

/** True when a {@link VerifyTokenResult} has the scope needed to submit a PR. */
export function hasRequiredScope(result: VerifyTokenResult | null): boolean {
  return result !== null && result.ok && result.missingScopes.length === 0;
}

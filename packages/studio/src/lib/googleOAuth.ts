// googleOAuth — Google OAuth (PKCE) identity-only helpers.
//
// Google = STATELESS identity-only session. The SPA drives the user through
// Google's OAuth authorize → callback → identity-exchange handshake, then
// stores the identity claims (sub, email, name, picture) returned by the
// backend. No Google access token or id token is ever held in the SPA.
//
// This module mirrors the structure of githubOAuth.ts for the Google flow.
// PKCE helpers are shared via ./pkce.ts (not duplicated here).
//
// Security contract:
//   - The client SECRET never appears here — the code→identity exchange goes
//     through the OAuth backend, which holds the secret server-side.
//   - PKCE is used so an intercepted authorization code is useless without the
//     code_verifier (which never leaves this browser tab).
//   - The identity is stored in sessionStorage (TAB-scoped, cleared on tab close),
//     never localStorage.
//   - `state` is validated on the callback to defeat CSRF.
//   - Distinct sessionStorage keys and redirect path from the GitHub flow so
//     the two flows never collide.
//
// Browser-only: uses crypto.randomUUID; imports from ./pkce.ts for PKCE.

import { generatePkce } from "./pkce.ts";
import type { GoogleIdentitySession } from "./identity.ts";
import { getBackendUrl } from "./githubOAuth.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Google's OAuth 2.0 authorize endpoint. */
const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";

/** Scopes requested: openid + profile + email covers identity claims only. */
const GOOGLE_SCOPE = "openid profile email";

/**
 * sessionStorage keys. Distinct from the GitHub keys so the two flows never
 * collide (spec'd: ks.google.identity, ks.google.oauth.verifier, ks.google.oauth.state).
 */
const IDENTITY_KEY = "ks.google.identity";
const VERIFIER_KEY = "ks.google.oauth.verifier";
const STATE_KEY = "ks.google.oauth.state";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Google OAuth client id (public; safe to ship in the browser). */
export function getGoogleClientId(): string {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";
}

/** The redirect URI registered with the Google OAuth app. */
export function getGoogleRedirectUri(): string {
  return `${window.location.origin}/oauth/google/callback`;
}

// ---------------------------------------------------------------------------
// Identity store (sessionStorage — tab-scoped, NEVER localStorage)
// ---------------------------------------------------------------------------

/**
 * The identity claims stored in sessionStorage after a successful Google
 * exchange. Mirrors the 200 response shape of POST /oauth/google/exchange.
 */
export interface StoredGoogleIdentity {
  readonly sub: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly name: string;
  readonly picture: string;
}

/** Persist the Google identity in sessionStorage. */
export function setStoredGoogleIdentity(identity: StoredGoogleIdentity): void {
  sessionStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
}

/** Read the stored Google identity, or null if absent / unparseable. */
export function getStoredGoogleIdentity(): StoredGoogleIdentity | null {
  const raw = sessionStorage.getItem(IDENTITY_KEY);
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredGoogleIdentity>;
    if (typeof parsed.sub !== "string") return null;
    if (typeof parsed.email !== "string") return null;
    if (typeof parsed.name !== "string") return null;
    if (typeof parsed.picture !== "string") return null;
    return {
      sub: parsed.sub,
      email: parsed.email,
      emailVerified: parsed.emailVerified === true,
      name: parsed.name,
      picture: parsed.picture,
    };
  } catch {
    return null;
  }
}

/** Clear the stored Google identity (Disconnect). */
export function clearStoredGoogleIdentity(): void {
  sessionStorage.removeItem(IDENTITY_KEY);
}

/** Convert a StoredGoogleIdentity to the IdentitySession shape for the UI. */
export function toGoogleIdentitySession(
  identity: StoredGoogleIdentity,
): GoogleIdentitySession {
  return {
    provider: "google",
    sub: identity.sub,
    email: identity.email,
    emailVerified: identity.emailVerified,
    name: identity.name,
    picture: identity.picture,
  };
}

// ---------------------------------------------------------------------------
// OAuth scratch state (verifier + state) — sessionStorage, cleared after use
// ---------------------------------------------------------------------------

/** Persist the PKCE verifier + CSRF state across the Google redirect. */
export function setGoogleOAuthScratch(verifier: string, state: string): void {
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);
}

/** Read the stored PKCE verifier for the Google flow (null if absent). */
export function getGoogleStoredVerifier(): string | null {
  return sessionStorage.getItem(VERIFIER_KEY);
}

/** Read the stored CSRF state for the Google flow (null if absent). */
export function getGoogleStoredState(): string | null {
  return sessionStorage.getItem(STATE_KEY);
}

/** Clear the PKCE verifier + CSRF state for the Google flow (call once consumed). */
export function clearGoogleOAuthScratch(): void {
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
}

// ---------------------------------------------------------------------------
// Authorize URL
// ---------------------------------------------------------------------------

/** Inputs to {@link buildGoogleAuthorizeUrl}. */
export interface BuildGoogleAuthorizeUrlInput {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}

/**
 * Build the Google authorize URL for the PKCE flow.
 *
 * Pure — does not redirect. The caller persists verifier+state, then assigns
 * the returned URL to window.location.
 */
export function buildGoogleAuthorizeUrl(input: BuildGoogleAuthorizeUrlInput): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPE,
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
  });
  return `${GOOGLE_AUTHORIZE_URL}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Connect — build PKCE + state, persist scratch, return the authorize URL
// ---------------------------------------------------------------------------

/**
 * Begin the Google OAuth flow: generate PKCE + state, persist the scratch
 * state, and return the Google authorize URL. The caller assigns it to
 * window.location.
 *
 * Throws if VITE_GOOGLE_CLIENT_ID is not configured.
 */
export async function beginGoogleAuthorize(): Promise<string> {
  const clientId = getGoogleClientId();
  if (clientId === "") {
    throw new Error(
      "Google OAuth is not configured (VITE_GOOGLE_CLIENT_ID is empty).",
    );
  }
  const { verifier, challenge } = await generatePkce();
  const state = crypto.randomUUID();
  setGoogleOAuthScratch(verifier, state);
  return buildGoogleAuthorizeUrl({
    clientId,
    redirectUri: getGoogleRedirectUri(),
    state,
    codeChallenge: challenge,
  });
}

// ---------------------------------------------------------------------------
// Identity exchange (via the OAuth backend — secret stays server-side)
// ---------------------------------------------------------------------------

/** Raw identity claims shape the backend returns on success (POST /oauth/google/exchange). */
interface BackendGoogleIdentityResponse {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  picture: string;
}

/** A typed error from the Google identity-exchange step. */
export class GoogleOAuthExchangeError extends Error {
  /** Safe backend error code. */
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "GoogleOAuthExchangeError";
    this.code = code;
  }
}

/**
 * Exchange an authorization `code` for identity claims via the OAuth backend.
 *
 * POSTs `{ code, code_verifier, redirect_uri }` to `${backend}/oauth/google/exchange`.
 * On a non-2xx response, throws a {@link GoogleOAuthExchangeError}.
 *
 * @param code - The `code` query param Google appended to the callback URL.
 * @param codeVerifier - The PKCE verifier persisted before the redirect.
 */
export async function exchangeGoogleCode(
  code: string,
  codeVerifier: string,
): Promise<StoredGoogleIdentity> {
  const url = `${getBackendUrl()}/oauth/google/exchange`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code,
        code_verifier: codeVerifier,
        redirect_uri: getGoogleRedirectUri(),
      }),
    });
  } catch {
    throw new GoogleOAuthExchangeError("network", "Network error during Google identity exchange.");
  }

  if (!res.ok) {
    let errorCode = "google_error";
    try {
      const body = (await res.json()) as { error?: unknown };
      if (typeof body.error === "string") errorCode = body.error;
    } catch {
      // non-JSON error body — keep the default code
    }
    throw new GoogleOAuthExchangeError(errorCode, `Google identity exchange failed: ${errorCode}`);
  }

  const data = (await res.json()) as BackendGoogleIdentityResponse;

  // Runtime guard: verify required identity fields are non-empty strings before
  // storing. A version-mismatch 200 could otherwise silently store undefined
  // values, making the user appear logged out on the next read.
  if (typeof data.sub !== "string" || data.sub === "") {
    throw new GoogleOAuthExchangeError(
      "invalid-response",
      "Google identity exchange returned a response missing the 'sub' field.",
    );
  }
  if (typeof data.email !== "string" || data.email === "") {
    throw new GoogleOAuthExchangeError(
      "invalid-response",
      "Google identity exchange returned a response missing the 'email' field.",
    );
  }
  if (typeof data.name !== "string" || data.name === "") {
    throw new GoogleOAuthExchangeError(
      "invalid-response",
      "Google identity exchange returned a response missing the 'name' field.",
    );
  }
  if (typeof data.picture !== "string" || data.picture === "") {
    throw new GoogleOAuthExchangeError(
      "invalid-response",
      "Google identity exchange returned a response missing the 'picture' field.",
    );
  }

  return {
    sub: data.sub,
    email: data.email,
    emailVerified: data.email_verified,
    name: data.name,
    picture: data.picture,
  };
}

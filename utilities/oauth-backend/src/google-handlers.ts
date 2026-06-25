/**
 * Handler logic for the Google OAuth identity-exchange endpoint.
 *
 * Google is identity-only: the backend exchanges the authorization code for
 * tokens at Google, decodes the returned id_token to extract identity claims,
 * and returns ONLY those claims to the SPA.  Neither the id_token nor the
 * access_token is forwarded.
 *
 * SECURITY CONTRACT:
 *  - The client secret is never logged and never appears in any response.
 *  - The authorization code, id_token, and access_token are never logged.
 *  - Claim validation is cheap (no crypto / JWKS): we received the id_token
 *    directly from Google over TLS in the same request, so signature
 *    verification adds no security benefit here.
 */

import type {
  GoogleExchangeBody,
  GoogleIdentity,
  GoogleTokenResponseShape,
  GoogleIdTokenPayload,
} from "./google-schemas.js";
import type { OAuthFetchFn, OAuthFetchResponse } from "./handlers.js";

// ---------------------------------------------------------------------------
// Config (same shape as HandlerConfig — kept separate to avoid coupling)
// ---------------------------------------------------------------------------

export interface GoogleHandlerConfig {
  googleClientId: string;
  /** Never log, never include in responses. */
  googleClientSecret: string;
  fetch: OAuthFetchFn;
}

// ---------------------------------------------------------------------------
// Handler result types (mirror handlers.ts pattern)
// ---------------------------------------------------------------------------

export type GoogleHandlerSuccess = { ok: true; data: GoogleIdentity };
export type GoogleHandlerError = { ok: false; status: number; error: string };
export type GoogleHandlerResult = GoogleHandlerSuccess | GoogleHandlerError;

// ---------------------------------------------------------------------------
// id_token decode and cheap claim validation (exported for unit testing)
// ---------------------------------------------------------------------------

/**
 * Decode the base64url-encoded payload segment of a JWT and JSON-parse it.
 *
 * Does NOT verify the signature — we received this token directly from
 * Google over TLS in the same server-side request, so signature
 * verification adds no security benefit in this context.
 *
 * Returns null if the string is not a structurally valid three-part JWT or
 * if the payload fails to JSON-parse.
 */
export function decodeIdTokenPayload(idToken: string): GoogleIdTokenPayload | null {
  const parts = idToken.split(".");
  if (parts.length !== 3) return null;

  const segment = parts[1];
  if (segment === undefined) return null;

  let jsonStr: string;
  try {
    jsonStr = Buffer.from(segment, "base64url").toString("utf8");
  } catch {
    return null;
  }

  try {
    return JSON.parse(jsonStr) as GoogleIdTokenPayload;
  } catch {
    return null;
  }
}

/**
 * Validate cheap (non-cryptographic) claims on a decoded id_token payload.
 *
 * Checks:
 *  1. `aud` equals `googleClientId` — prevents tokens issued to another app.
 *  2. `iss` is `accounts.google.com` or `https://accounts.google.com`.
 *  3. `exp` (seconds since epoch) is in the future.
 *
 * Returns null if all checks pass, or a safe error string if any fail.
 */
export function validateIdTokenClaims(
  payload: GoogleIdTokenPayload,
  googleClientId: string
): string | null {
  // aud check
  if (payload.aud !== googleClientId) {
    return "invalid_id_token";
  }

  // iss check
  const validIssuers = ["accounts.google.com", "https://accounts.google.com"];
  if (payload.iss === undefined || !validIssuers.includes(payload.iss)) {
    return "invalid_id_token";
  }

  // exp check (seconds)
  if (payload.exp === undefined || payload.exp <= Math.floor(Date.now() / 1000)) {
    return "invalid_id_token";
  }

  return null;
}

// ---------------------------------------------------------------------------
// googleExchange: POST /oauth/google/exchange
// ---------------------------------------------------------------------------

/**
 * Exchange a Google authorization code (PKCE) for identity claims.
 *
 * Calls `POST https://oauth2.googleapis.com/token` with the code, verifier,
 * redirect URI, client credentials, and grant_type=authorization_code.
 *
 * On success, decodes the returned id_token, validates cheap claims, and
 * returns the identity fields (sub, email, email_verified, name, picture).
 *
 * Never returns the id_token or access_token to the caller.
 */
export async function googleExchange(
  body: GoogleExchangeBody,
  config: GoogleHandlerConfig
): Promise<GoogleHandlerResult> {
  const formParams = new URLSearchParams({
    code: body.code,
    client_id: config.googleClientId,
    client_secret: config.googleClientSecret,
    redirect_uri: body.redirect_uri,
    grant_type: "authorization_code",
    code_verifier: body.code_verifier,
  });

  let googleResponse: OAuthFetchResponse;
  try {
    googleResponse = await config.fetch(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formParams.toString(),
      }
    );
  } catch {
    // Network-level error — do not propagate internal details
    return { ok: false, status: 502, error: "upstream_unavailable" };
  }

  let data: GoogleTokenResponseShape;
  try {
    data = (await googleResponse.json()) as GoogleTokenResponseShape;
  } catch {
    return { ok: false, status: 502, error: "upstream_invalid_response" };
  }

  // Google 4xx/5xx with no error field in the body → gateway error
  if (!googleResponse.ok && data.error === undefined) {
    return { ok: false, status: 502, error: "upstream_error" };
  }

  // Google returned an error in the body (bad code, wrong client, etc.)
  if (data.error !== undefined) {
    // Map known Google error strings to safe codes; fall back to generic
    const safeCode = SAFE_GOOGLE_ERROR_CODES[data.error] ?? "google_error";
    return { ok: false, status: 400, error: safeCode };
  }

  // No id_token in the response — should not happen for a valid exchange
  if (data.id_token === undefined || data.id_token === "") {
    return { ok: false, status: 502, error: "upstream_invalid_response" };
  }

  // Decode the id_token payload (no signature verification — see docstring)
  const payload = decodeIdTokenPayload(data.id_token);
  if (payload === null) {
    return { ok: false, status: 502, error: "upstream_invalid_response" };
  }

  // Validate cheap claims
  const claimError = validateIdTokenClaims(payload, config.googleClientId);
  if (claimError !== null) {
    return { ok: false, status: 400, error: claimError };
  }

  // Extract required identity fields; reject if any are absent
  const { sub, email, name, picture } = payload;
  if (
    typeof sub !== "string" || sub === "" ||
    typeof email !== "string" || email === "" ||
    typeof name !== "string" || name === "" ||
    typeof picture !== "string" || picture === ""
  ) {
    return { ok: false, status: 400, error: "invalid_id_token" };
  }

  const identity: GoogleIdentity = {
    sub,
    email,
    email_verified: payload.email_verified === true,
    name,
    picture,
  };

  return { ok: true, data: identity };
}

// ---------------------------------------------------------------------------
// Safe error code mapping for Google error responses
// ---------------------------------------------------------------------------

const SAFE_GOOGLE_ERROR_CODES: Record<string, string> = {
  invalid_grant: "invalid_grant",
  invalid_client: "invalid_client",
  redirect_uri_mismatch: "redirect_uri_mismatch",
  access_denied: "access_denied",
  invalid_request: "invalid_request",
};

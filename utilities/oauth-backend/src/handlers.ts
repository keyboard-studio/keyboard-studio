/**
 * Core handler logic for the OAuth token exchange and refresh endpoints.
 *
 * The GitHub fetch function is injected so unit tests can stub it without
 * hitting the network — the same dependency-injection pattern used in
 * packages/engine/src/output/github.ts (GitHubFetchFn).
 *
 * SECURITY CONTRACT:
 *  - The client secret is read from env inside `createHandlers`; it is
 *    never passed to the caller and never appears in any response or log.
 *  - The authorization code and the resulting token are not logged at any
 *    level.
 *  - No token is stored server-side beyond the in-flight exchange request.
 */

import type {
  ExchangeBody,
  RefreshBody,
  TokenResponse,
  GitHubTokenResponseShape,
} from "./schemas.js";

// ---------------------------------------------------------------------------
// Fetch abstraction (intentionally minimal local contract; not a mirror of engine GitHubFetchFn)
// ---------------------------------------------------------------------------

export type OAuthFetchFn = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }
) => Promise<OAuthFetchResponse>;

export interface OAuthFetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Safe error codes returned to the SPA
// ---------------------------------------------------------------------------

/**
 * Maps GitHub's `error` field values to safe codes we send to the SPA.
 * We never forward raw GitHub error_description because it could contain
 * the code or other sensitive context.
 */
const SAFE_ERROR_CODES: Record<string, string> = {
  bad_verification_code: "bad_verification_code",
  incorrect_client_credentials: "incorrect_client_credentials",
  redirect_uri_mismatch: "redirect_uri_mismatch",
  access_denied: "access_denied",
  unsupported_grant_type: "unsupported_grant_type",
  incorrect_client_secret: "incorrect_client_credentials",
};

function safeErrorCode(raw: string | undefined): string {
  if (raw === undefined) return "github_error";
  return SAFE_ERROR_CODES[raw] ?? "github_error";
}

// ---------------------------------------------------------------------------
// Handler result types
// ---------------------------------------------------------------------------

export type HandlerSuccess = { ok: true; data: TokenResponse };
export type HandlerError = { ok: false; status: number; error: string };
export type HandlerResult = HandlerSuccess | HandlerError;

// ---------------------------------------------------------------------------
// Config injected at startup
// ---------------------------------------------------------------------------

export interface HandlerConfig {
  clientId: string;
  /** Never log, never include in responses. */
  clientSecret: string;
  fetch: OAuthFetchFn;
}

// ---------------------------------------------------------------------------
// Private helper: call the GitHub token endpoint
// ---------------------------------------------------------------------------

/**
 * Shared implementation for the exchange and refresh flows.
 *
 * Callers pass the full `payload` (already including `client_id`,
 * `client_secret`, and any flow-specific fields).  The only difference
 * between `exchange` and `refresh` is the payload shape.
 *
 * Error mapping:
 *  - Network throw          → 502 upstream_unavailable
 *  - Non-ok HTTP, no error  → 502 upstream_error   (GitHub 429/500/etc.)
 *  - Any data.error field   → 400 safe error code
 *  - JSON parse failure     → 502 upstream_invalid_response
 */
async function callGitHubTokenEndpoint(
  payload: Record<string, string>,
  config: HandlerConfig
): Promise<HandlerResult> {
  let ghResponse: OAuthFetchResponse;
  try {
    ghResponse = await config.fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      }
    );
  } catch {
    // Network-level error — do not propagate internal details
    return { ok: false, status: 502, error: "upstream_unavailable" };
  }

  let data: GitHubTokenResponseShape;
  try {
    data = (await ghResponse.json()) as GitHubTokenResponseShape;
  } catch {
    return { ok: false, status: 502, error: "upstream_invalid_response" };
  }

  // Upstream 4xx/5xx with no error field in the body → gateway error, not a
  // client error.  GitHub 429 (rate-limit) and 5xx (server error) fall here.
  if (!ghResponse.ok && data.error === undefined) {
    return { ok: false, status: 502, error: "upstream_error" };
  }

  if (data.error !== undefined || data.access_token === undefined) {
    return {
      ok: false,
      status: 400,
      error: safeErrorCode(data.error),
    };
  }

  const tokenResponse: TokenResponse = {
    access_token: data.access_token,
    token_type: data.token_type ?? "bearer",
    scope: data.scope ?? "",
  };
  // Forward a rotated refresh token when GitHub issues one (GitHub Apps with
  // token expiration enabled).  A refresh token is not the client secret —
  // the client secret is never present in any response.
  if (data.refresh_token !== undefined) {
    tokenResponse.refresh_token = data.refresh_token;
  }

  return { ok: true, data: tokenResponse };
}

// ---------------------------------------------------------------------------
// exchange: POST /oauth/exchange
// ---------------------------------------------------------------------------

/**
 * Exchange a GitHub authorization code for an access token.
 *
 * Calls `POST https://github.com/login/oauth/access_token` with
 * `client_id`, `client_secret`, `code`, and optional `code_verifier` /
 * `redirect_uri` pass-through fields.
 *
 * Returns `{ access_token, token_type, scope }` on success — the exact
 * fields the engine's github.ts verifyToken() / publishPR() consume.
 * On GitHub error returns a safe 400 with a sanitised error code only.
 */
export async function exchange(
  body: ExchangeBody,
  config: HandlerConfig
): Promise<HandlerResult> {
  const payload: Record<string, string> = {
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code: body.code,
  };
  if (body.code_verifier !== undefined) payload["code_verifier"] = body.code_verifier;
  if (body.redirect_uri !== undefined) payload["redirect_uri"] = body.redirect_uri;

  return callGitHubTokenEndpoint(payload, config);
}

// ---------------------------------------------------------------------------
// refresh: POST /oauth/refresh
// ---------------------------------------------------------------------------

/**
 * Refresh an expiring token using the `refresh_token` grant.
 *
 * Classic GitHub OAuth App tokens do not expire, so GitHub will typically
 * return an error for those. GitHub Apps with token expiration enabled
 * will get a new token set back.
 *
 * We pass the response through thinly — the SPA is responsible for
 * deciding what to do with the refresh token set.
 */
export async function refresh(
  body: RefreshBody,
  config: HandlerConfig
): Promise<HandlerResult> {
  const payload: Record<string, string> = {
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
    refresh_token: body.refresh_token,
  };

  return callGitHubTokenEndpoint(payload, config);
}

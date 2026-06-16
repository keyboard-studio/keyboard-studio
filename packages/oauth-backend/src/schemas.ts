/**
 * Zod request/response schemas for the OAuth backend endpoints.
 *
 * All input validation goes through these schemas so malformed requests
 * are rejected with 400 before any GitHub API call is made.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// POST /oauth/exchange
// ---------------------------------------------------------------------------

export const ExchangeBodySchema = z.object({
  /** The one-time authorization code from GitHub's redirect. */
  code: z.string().min(1),
  /** PKCE code verifier (S256 flow). Pass through to GitHub when provided. */
  code_verifier: z.string().min(1).optional(),
  /** Redirect URI used in the original authorization request, if any. */
  redirect_uri: z.string().url().optional(),
});

export type ExchangeBody = z.infer<typeof ExchangeBodySchema>;

// ---------------------------------------------------------------------------
// POST /oauth/refresh
// ---------------------------------------------------------------------------

export const RefreshBodySchema = z.object({
  /** The refresh token obtained from a previous exchange or refresh. */
  refresh_token: z.string().min(1),
});

export type RefreshBody = z.infer<typeof RefreshBodySchema>;

// ---------------------------------------------------------------------------
// Shared GitHub token response
// ---------------------------------------------------------------------------

/**
 * The token response returned to the SPA.
 *
 * `refresh_token` is included only when GitHub issues one (GitHub Apps with
 * token expiration enabled). It is NOT the client secret — forwarding it is
 * safe; the client secret never appears in any response.
 */
export interface TokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  /** New refresh token issued by GitHub, if any. Absent for classic OAuth Apps. */
  refresh_token?: string;
}

/**
 * The full GitHub token response shape (includes refresh fields for
 * GitHub Apps with token expiration enabled).
 */
export interface GitHubTokenResponseShape {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
  error_uri?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
}

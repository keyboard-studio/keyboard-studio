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

/**
 * Discriminator that selects which GitHub credential pair the backend uses.
 *
 * - `"github_app"` (default when absent) — GitHub App user-to-server
 *   credentials (`GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`). Used for the
 *   standard identity sign-in flow.
 * - `"oauth_app"` — Classic OAuth App credentials
 *   (`GITHUB_OAUTH_CLIENT_ID` / `GITHUB_OAUTH_CLIENT_SECRET`). Used for the
 *   Option A "fork & submit yourself" flow that requires the `public_repo`
 *   scope.
 *
 * Any other value is rejected with `invalid_request` before a GitHub API call
 * is made. The field is optional in the request body; handlers default to
 * `"github_app"` when it is absent.
 */
const ClientDiscriminatorSchema = z.enum(["github_app", "oauth_app"]).optional();

/**
 * The resolved client discriminator value — always one of the two literal
 * strings, never `undefined`. Use this type for handler parameters that have
 * already defaulted the field; the optional wrapper is retained in the request
 * body schemas (`ExchangeBodySchema`, `RefreshBodySchema`) where the field may
 * be absent.
 */
export type ClientDiscriminator = "github_app" | "oauth_app";

export const ExchangeBodySchema = z.object({
  /** The one-time authorization code from GitHub's redirect. */
  code: z.string().min(1),
  /** PKCE code verifier (S256 flow). Pass through to GitHub when provided. */
  code_verifier: z.string().min(1).optional(),
  /** Redirect URI used in the original authorization request, if any. */
  redirect_uri: z.string().url().optional(),
  /**
   * Which GitHub credential pair to use. Optional — defaults to
   * `"github_app"` when absent. The SPA sets this to `"oauth_app"` for the
   * Option A fork-and-submit flow.
   */
  client: ClientDiscriminatorSchema,
});

export type ExchangeBody = z.infer<typeof ExchangeBodySchema>;

// ---------------------------------------------------------------------------
// POST /oauth/refresh
// ---------------------------------------------------------------------------

export const RefreshBodySchema = z.object({
  /** The refresh token obtained from a previous exchange or refresh. */
  refresh_token: z.string().min(1),
  /**
   * Which GitHub credential pair to use. Optional — defaults to
   * `"github_app"` when absent. Classic OAuth App tokens do not expire so a
   * refresh with `"oauth_app"` is unusual but accepted; GitHub will return an
   * error if the grant type is unsupported.
   */
  client: ClientDiscriminatorSchema,
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

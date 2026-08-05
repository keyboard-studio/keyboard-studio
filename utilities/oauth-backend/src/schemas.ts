/**
 * Zod request/response schemas for the OAuth backend endpoints.
 *
 * All input validation goes through these schemas so malformed requests
 * are rejected with 400 before any GitHub API call is made.
 */

import type { GitHubOAuthClient } from "@keyboard-studio/contracts";
import { z } from "zod";

/**
 * The client-discriminator literals, declared locally rather than imported as a
 * *value* from `@keyboard-studio/contracts`.
 *
 * WHY THE COPY — do not "fix" this back into a value import. The co-located
 * Vercel functions under `api/` reach this module through a relative path and
 * live OUTSIDE the pnpm workspace, so anything this module imports as a value
 * must survive being traced into a serverless bundle. A value import of
 * contracts pulls in its whole barrel, which re-exports data modules that load
 * checked-in JSON from `packages/contracts/data/` — paths outside the emitted
 * `dist/`. That resolution fails inside the function bundle, and because it
 * fails at ESM module load the handler never runs: every route 500s with a
 * platform-level FUNCTION_INVOCATION_FAILED instead of a JSON error body, which
 * is indistinguishable from an outage and takes sign-in down completely.
 *
 * The `import type` above is erased at compile time, so it costs the bundle
 * nothing while `_ClientUnionGuard` below still fails the build if this copy
 * ever drifts from the shared wire contract.
 */
const GITHUB_OAUTH_CLIENTS = ["github_app", "oauth_app"] as const;

// ---------------------------------------------------------------------------
// POST /oauth/exchange
// ---------------------------------------------------------------------------

/**
 * Discriminator that selects which GitHub credential pair the backend uses.
 * Built from the shared wire-contract union `GitHubOAuthClient`
 * (`@keyboard-studio/contracts`) so this schema cannot diverge from the SPA's
 * `GitHubClient` type without a compile error.
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
const ClientDiscriminatorSchema = z.enum(GITHUB_OAUTH_CLIENTS).optional();

/**
 * The resolved client discriminator value — always one of the two literal
 * strings, never `undefined`. Use this type for handler parameters that have
 * already defaulted the field; the optional wrapper is retained in the request
 * body schemas (`ExchangeBodySchema`, `RefreshBodySchema`) where the field may
 * be absent. Alias of the shared `GitHubOAuthClient` wire-contract type.
 */
export type ClientDiscriminator = GitHubOAuthClient;

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

// ---------------------------------------------------------------------------
// Compile-time drift guard.
//
// `GITHUB_OAUTH_CLIENTS` above is a local copy of the shared wire contract's
// client union (see its doc comment for why it cannot be a value import). This
// guard is what keeps the copy honest: the two unions must be mutually
// assignable, so adding, removing, or renaming a client on either side fails
// the build here rather than diverging silently between the SPA and this
// backend. Follows the same alias-declaration-as-assertion idiom the contracts
// package uses for its schema/interface guards.
// ---------------------------------------------------------------------------

type Expect<T extends true> = T;
type MutuallyAssignable<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : false
  : false;

// Intentionally unused at the value level — the declaration IS the assertion.
type _ClientUnionGuard = Expect<
  MutuallyAssignable<(typeof GITHUB_OAUTH_CLIENTS)[number], GitHubOAuthClient>
>;

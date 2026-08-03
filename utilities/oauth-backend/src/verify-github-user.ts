/**
 * Server-side GitHub identity verification.
 *
 * The OAuth exchange endpoints hand the access token to the SPA and forget it
 * (see the security contract in handlers.ts) — the backend holds no session and
 * has never known who the user is. The draft-persistence endpoints need a
 * stable, *server-verified* owner key, so they call this against the token the
 * SPA presents in the `Authorization` header.
 *
 * We key drafts on the numeric `id` (rename-stable) and keep `login` only for
 * display/debugging. The GitHub fetch is injected (OAuthFetchFn) so this unit
 * tests without the network, matching the pattern in handlers.ts.
 */

import type { OAuthFetchFn } from "./handlers.js";

export interface GitHubUser {
  /** Numeric GitHub user id — stable across username changes. The draft owner key. */
  id: number;
  /** Current GitHub login (username). Denormalized for display; may change. */
  login: string;
}

/**
 * Extract a bearer token from an `Authorization` header value, or null.
 * Accepts both `Bearer <t>` and `token <t>` (GitHub's own convention), any case.
 */
export function parseBearer(header: string | null | undefined): string | null {
  if (header == null) return null;
  const m = /^(?:bearer|token)\s+(.+)$/i.exec(header.trim());
  if (m === null) return null;
  const token = m[1]!.trim();
  return token === "" ? null : token;
}

/** Optional provenance settings for {@link verifyGitHubUser}. */
export interface VerifyOptions {
  /**
   * Client ids this deployment issued tokens under — `GITHUB_CLIENT_ID` (the
   * GitHub App user-to-server credential behind sign-in) and
   * `GITHUB_OAUTH_CLIENT_ID` (the classic OAuth App behind the Option A
   * `public_repo` flow). When the `GET /user` response carries an
   * `X-OAuth-Client-ID` header matching none of these, verification fails.
   *
   * Pass **both** configured ids: accepting only one refuses Option A's
   * classic-OAuth-App tokens on the draft endpoints.
   *
   * An absent header passes and an empty/omitted array disables the check —
   * both fail-open, deliberately. This is defense-in-depth against a token
   * issued to some *other* application, a precondition an attacker must already
   * have met; making an absent header fatal would break every fetch adapter
   * that does not surface headers. Identity verification itself stays
   * fail-closed (an unreachable provider still yields null, below).
   */
  allowedClientIds?: readonly string[];
}

/**
 * Verify a GitHub access token by calling `GET /user`. Returns the verified
 * identity, or null when the token is missing/invalid/revoked, GitHub is
 * unreachable, or the token was issued to a different application than the
 * configured ones — callers map null to 401. Never throws.
 *
 * A `User-Agent` is required by the GitHub API; `Accept` pins the v3 JSON media
 * type. The token is never logged.
 */
export async function verifyGitHubUser(
  token: string | null,
  fetchFn: OAuthFetchFn,
  options?: VerifyOptions,
): Promise<GitHubUser | null> {
  if (token === null || token === "") return null;

  let res: Awaited<ReturnType<OAuthFetchFn>>;
  try {
    res = await fetchFn("https://api.github.com/user", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "keyboard-studio-drafts",
      },
    });
  } catch {
    return null;
  }

  if (!res.ok) return null;

  // Token provenance: refuse a token this application did not issue. Both an
  // absent header and an unconfigured allow-list skip the check (see
  // VerifyOptions.allowedClientIds for why that is deliberate).
  const allowed = options?.allowedClientIds;
  if (allowed !== undefined && allowed.length > 0) {
    const presented = res.headers?.get("X-OAuth-Client-ID") ?? null;
    if (presented !== null && !allowed.includes(presented)) return null;
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return null;
  }

  if (
    body === null ||
    typeof body !== "object" ||
    typeof (body as { id?: unknown }).id !== "number" ||
    typeof (body as { login?: unknown }).login !== "string"
  ) {
    return null;
  }

  const { id, login } = body as { id: number; login: string };
  return { id, login };
}

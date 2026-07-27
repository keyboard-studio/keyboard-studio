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

/**
 * Verify a GitHub access token by calling `GET /user`. Returns the verified
 * identity, or null when the token is missing/invalid/revoked or GitHub is
 * unreachable — callers map null to 401. Never throws.
 *
 * A `User-Agent` is required by the GitHub API; `Accept` pins the v3 JSON media
 * type. The token is never logged.
 */
export async function verifyGitHubUser(
  token: string | null,
  fetchFn: OAuthFetchFn,
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

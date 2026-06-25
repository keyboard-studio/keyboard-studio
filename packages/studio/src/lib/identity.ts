// identity — the IdentitySession discriminated union for the studio layer.
//
// This union is the routing signal used across the UI to determine which
// provider the user is signed in with, and to gate affordances that require
// a specific provider (e.g. Option A fork+PR requires a GitHub token).
//
// Design:
//   - Lives in the studio layer only (NOT in packages/contracts).
//   - Google variant stores identity claims returned by the backend, NOT any
//     Google access token or id token (those are never held in the SPA).
//   - GitHub variant wraps the existing StoredGitHubToken type.
//
// Option A gating: affordances that require a GitHub token (fork+PR) MUST
// check `session.provider === "github"` before calling Option A APIs.
// When provider is "google", Option A should be disabled with a
// "Connect GitHub to use this option" prompt (do not hide it).

import type { StoredGitHubToken } from "./githubOAuth.ts";

/** Identity session for a GitHub-authenticated user. */
export interface GitHubIdentitySession {
  readonly provider: "github";
  /** The stored GitHub OAuth token (used for Option A fork+PR). */
  readonly token: StoredGitHubToken;
  /** The GitHub login handle returned by verifyToken, or null if not yet verified. */
  readonly login: string | null;
}

/**
 * Identity session for a Google-authenticated user.
 *
 * The SPA stores only the identity claims the backend returned — never any
 * Google access token or id token. This is a stateless identity-only session.
 */
export interface GoogleIdentitySession {
  readonly provider: "google";
  /** The Google subject identifier (stable across sessions for the same user). */
  readonly sub: string;
  /** The user's verified email address. */
  readonly email: string;
  /** True if Google has verified ownership of this email address. */
  readonly emailVerified: boolean;
  /** The user's display name. */
  readonly name: string;
  /** URL of the user's profile picture (from Google's CDN — not stored locally). */
  readonly picture: string;
}

/**
 * A session established by any supported identity provider.
 *
 * Use `session.provider` to discriminate:
 *   - `"github"` — has a GitHub token; Option A (fork+PR) is available.
 *   - `"google"` — identity-only; Option A is NOT available (no GitHub token).
 */
export type IdentitySession = GitHubIdentitySession | GoogleIdentitySession;

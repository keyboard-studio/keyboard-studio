/**
 * Server-side GitHub Git Data API pipeline for Option B (org-mediated PR).
 *
 * The SPA never holds a token in this path. It POSTs pre-filtered source files
 * plus author attribution to POST /submit/managed-pr; this module runs the
 * fork -> tree -> commit -> branch -> draft-PR pipeline using the GitHub App
 * installation token, which lives server-side only.
 *
 * Vendored from packages/engine/src/output/github.ts -- keep in sync.
 *
 * Intentional divergences from the Option A origin:
 *   1. Org standing fork (forkOwner from config), not the user's fork.
 *   2. Branch name add/<keyboardId>-<shortHash> (collision suffix).
 *   3. Commit carries a Co-authored-by trailer crediting the human author.
 *   4. PR title normalized to "[<keyboardId>] <desc>" (keymanapp convention).
 *   5. PR body prepends a provenance block naming the human author.
 *   6. Installation-token 401/403 surfaces as upstream/unavailable, never as user auth/scope.
 *
 * SECURITY CONTRACT (parity with handlers.ts / google-handlers.ts):
 *  - The installation token is never logged and never appears in any response body.
 *  - On any GitHub auth/scope failure (401/403) the route returns a generic
 *    "submission_unavailable" -- a misconfigured installation token is a server
 *    problem, never surfaced to the SPA as an actionable client error.
 */

import type { ManagedPRBody } from "./managed-pr-schemas.js";

// ---------------------------------------------------------------------------
// Pipeline-local fetch abstraction -- richer than OAuthFetchResponse so we
// can read response headers (e.g. Retry-After on 429). Mirrors the shape of
// GitHubFetchResponse in packages/engine/src/output/github.ts.
// ---------------------------------------------------------------------------

export interface GitHubPipelineFetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export type GitHubPipelineFetchFn = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
  }
) => Promise<GitHubPipelineFetchResponse>;

// ---------------------------------------------------------------------------
// Config -- org credentials injected at startup, never returned to the route
// ---------------------------------------------------------------------------

export interface ManagedPRPipelineConfig {
  /**
   * Provider callback that returns a GitHub App installation token on each call.
   * Called once per request so @octokit/auth-app's internal cache/refresh logic
   * is exercised per-request rather than at server startup (tokens expire ~1 h).
   * The returned token has contents:write + pull_requests:write scope. Never logged.
   */
  getInstallationToken: () => Promise<string>;
  /** GitHub login that owns the studio's standing fork of keymanapp/keyboards. */
  orgLogin: string;
  fetch: GitHubPipelineFetchFn;
}

// ---------------------------------------------------------------------------
// Handler result -- mirrors handlers.ts HandlerResult, plus the extra fields
// the engine's PublishManagedPRError mapping reads (branchName / retry).
// ---------------------------------------------------------------------------

export type ManagedPRHandlerResult =
  | { ok: true; data: { prUrl: string; commitSha: string } }
  | {
      ok: false;
      status: number;
      error: string;
      /** Surfaced in the 409 body so the engine maps to branch-exists. */
      branchName?: string;
      /** Surfaced via Retry-After on 429. */
      retryAfterSeconds?: number;
    };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE = "https://api.github.com";
const UPSTREAM_OWNER = "keymanapp";
const UPSTREAM_REPO = "keyboards";

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit testing)
// ---------------------------------------------------------------------------

/**
 * Normalize a PR title to the keymanapp/keyboards convention.
 *
 * All keyboard PRs in keymanapp/keyboards are titled "[<id>] <desc>". If the
 * SPA-supplied title already starts with "[" it is returned unchanged (to
 * avoid double-wrapping a title the caller already formatted). Otherwise the
 * keyboard ID bracket prefix is prepended.
 */
export function normalizePrTitle(keyboardId: string, prTitle: string): string {
  return prTitle.startsWith("[") ? prTitle : `[${keyboardId}] ${prTitle}`;
}

/**
 * Build the single-commit message: the normalized PR title followed by a
 * `Co-authored-by` trailer crediting the human author. The org account is the
 * committer; this trailer is how the human gets attribution in git history.
 */
export function buildCommitMessage(
  normalizedTitle: string,
  attribution: ManagedPRBody["attribution"]
): string {
  return `${normalizedTitle}\n\nCo-authored-by: ${attribution.displayName} <${attribution.email}>`;
}

/**
 * Build the PR body, prepending a provenance block that names the human author
 * so keymanapp/keyboards maintainers have a reachability channel. The
 * importAttribution section (when present) is appended after prBody.
 *
 * Divergence 5 from the Option A origin: Option A uses the PR body verbatim;
 * Option B must surface the human author because the committer is the org bot.
 */
export function buildPrBody(body: ManagedPRBody): string {
  const provenance = [
    `> Submitted through **Keyboard Studio** on behalf of **${body.attribution.displayName}** (${body.attribution.email}).`,
    `> Keyman maintainers: please contact the author above for licensing or DISCUS follow-up.`,
  ].join("\n");

  const parts = [`${provenance}\n\n${body.prBody}`];
  if (body.importAttribution !== undefined && body.importAttribution.length > 0) {
    parts.push(body.importAttribution);
  }
  return parts.join("\n\n");
}

/**
 * Branch name on the org fork: `add/<keyboardId>-<shortSha>`.
 *
 * The short SHA is the first 7 chars of the new commit -- deterministic and
 * content-unique, so re-submitting the same keyboard while a prior branch is
 * still open does not collide (resolves docs/github-integration.md §5 Q1).
 */
export function buildManagedBranchName(keyboardId: string, commitSha: string): string {
  return `add/${keyboardId}-${commitSha.slice(0, 7)}`;
}

function buildHeaders(token: string): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

// ---------------------------------------------------------------------------
// submitManagedPR -- the route handler
// ---------------------------------------------------------------------------

/**
 * Run the org-mediated fork+PR pipeline for a validated request body.
 *
 * Returns a discriminated result (never throws) in the same shape handlers.ts
 * uses, so the route can `if (!result.ok) reply.status(result.status)`.
 *
 * Error mapping (all token-leak-safe):
 *  - Network throw                 -> 502 submission_unavailable
 *  - GitHub 401/403 (org token)    -> 502 submission_unavailable (server misconfig)
 *  - GitHub 429                    -> 429 rate_limited (+ retryAfterSeconds from header)
 *  - Branch already exists (422)   -> 409 branch_exists (+ branchName)
 *  - Any other non-ok              -> 502 upstream_error
 */
export async function submitManagedPR(
  body: ManagedPRBody,
  config: ManagedPRPipelineConfig
): Promise<ManagedPRHandlerResult> {
  const { getInstallationToken, orgLogin, fetch: fetchFn } = config;
  const forkBase = `${API_BASE}/repos/${orgLogin}/${UPSTREAM_REPO}`;
  const upstreamBase = `${API_BASE}/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}`;

  // Mint (or retrieve from cache) the installation token once per request.
  // If the provider throws, the outer try/catch maps it to 502 submission_unavailable.
  const installationToken = await getInstallationToken();

  const call = (url: string, method = "GET", payload?: unknown) =>
    fetchFn(url, {
      method,
      headers: buildHeaders(installationToken),
      ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
    });

  // Map a GitHub non-ok response to a safe handler error. 401/403 mean the
  // installation token is missing/insufficient -- a server-side misconfiguration,
  // surfaced generically and never leaking that the installation token is the problem.
  const mapNonOk = (res: GitHubPipelineFetchResponse): ManagedPRHandlerResult => {
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: 502, error: "submission_unavailable" };
    }
    if (res.status === 429) {
      const ra = Number(res.headers.get("Retry-After") ?? "60");
      return {
        ok: false,
        status: 429,
        error: "rate_limited",
        retryAfterSeconds: Number.isFinite(ra) ? ra : 60,
      };
    }
    return { ok: false, status: 502, error: "upstream_error" };
  };

  // Compute the normalized title once; it is used as both the PR title and the
  // commit message subject (divergences 3 and 4 from Option A).
  const normalizedTitle = normalizePrTitle(body.keyboardId, body.prTitle);

  try {
    // 1. Ensure the org fork exists.
    const forkCheck = await call(forkBase);
    if (!forkCheck.ok) {
      if (forkCheck.status !== 404) return mapNonOk(forkCheck);
      const created = await call(`${upstreamBase}/forks`, "POST", {});
      if (!created.ok) return mapNonOk(created);
    }

    // 2. Read the fork's master HEAD commit SHA.
    const masterRef = await call(`${forkBase}/git/ref/heads/master`);
    if (!masterRef.ok) return mapNonOk(masterRef);
    const refData = (await masterRef.json()) as { object: { sha: string } };
    const masterCommitSha = refData.object.sha;

    // 3. Read the base tree SHA from the parent commit.
    const parentCommit = await call(`${forkBase}/git/commits/${masterCommitSha}`);
    if (!parentCommit.ok) return mapNonOk(parentCommit);
    const parentData = (await parentCommit.json()) as { tree: { sha: string } };
    const baseTreeSha = parentData.tree.sha;

    // 4. Build the tree from the SPA-filtered source files (text content only).
    const treeEntries = body.sourceFiles.map((f) => ({
      path: f.path,
      mode: "100644",
      type: "blob",
      content: f.content,
    }));

    // 5. Create the tree.
    const newTree = await call(`${forkBase}/git/trees`, "POST", {
      base_tree: baseTreeSha,
      tree: treeEntries,
    });
    if (!newTree.ok) return mapNonOk(newTree);
    const newTreeSha = ((await newTree.json()) as { sha: string }).sha;

    // 6. Create the commit (org committer + Co-authored-by human trailer).
    const newCommit = await call(`${forkBase}/git/commits`, "POST", {
      message: buildCommitMessage(normalizedTitle, body.attribution),
      tree: newTreeSha,
      parents: [masterCommitSha],
    });
    if (!newCommit.ok) return mapNonOk(newCommit);
    const newCommitSha = ((await newCommit.json()) as { sha: string }).sha;

    // 7. Create the branch ref (content-unique short-SHA suffix).
    const branchName = buildManagedBranchName(body.keyboardId, newCommitSha);
    const branchRef = await call(`${forkBase}/git/refs`, "POST", {
      ref: `refs/heads/${branchName}`,
      sha: newCommitSha,
    });
    if (!branchRef.ok) {
      if (branchRef.status === 422) {
        return { ok: false, status: 409, error: "branch_exists", branchName };
      }
      return mapNonOk(branchRef);
    }

    // 8. Open the draft PR upstream (divergences 4 and 5 from Option A).
    const pr = await call(`${upstreamBase}/pulls`, "POST", {
      title: normalizedTitle,
      body: buildPrBody(body),
      head: `${orgLogin}:${branchName}`,
      base: "master",
      draft: true,
    });
    if (!pr.ok) return mapNonOk(pr);
    const prData = (await pr.json()) as { html_url: string };

    return { ok: true, data: { prUrl: prData.html_url, commitSha: newCommitSha } };
  } catch {
    // Network-level error -- do not propagate internal details.
    return { ok: false, status: 502, error: "submission_unavailable" };
  }
}

/**
 * Server-side GitHub Git Data API pipeline for Option B (org-mediated PR).
 *
 * The SPA holds no *repository* credential in this path. It POSTs pre-filtered
 * source files plus author attribution to POST /submit/managed-pr, presenting
 * its sign-in token purely as proof of identity; this module runs the
 * tree -> commit -> branch -> draft-PR pipeline using the GitHub App
 * installation token, which lives server-side only and is never returned.
 *
 * Vendored from packages/engine/src/output/github.ts -- keep in sync.
 *
 * Intentional divergences from the Option A origin:
 *   1. Org standing fork (forkOwner from config), not the user's fork.
 *   2. Branch name add/<keyboardId>-<shortHash> (collision suffix).
 *   3. Commit carries a Co-authored-by trailer crediting the human author,
 *      addressed from the SERVER-VERIFIED identity, never from the request body.
 *   4. PR title normalized to "[<keyboardId>] <desc>" (keymanapp convention).
 *   5. PR body prepends a provenance block naming the human author.
 *   6. Installation-token 401/403 surfaces as upstream/unavailable, never as user auth/scope.
 *
 * SECURITY CONTRACT (parity with handlers.ts / google-handlers.ts):
 *  - The installation token is never logged and never appears in any response body.
 *  - On any GitHub auth/scope failure (401/403) the route returns a generic
 *    "submission_unavailable" -- a misconfigured installation token is a server
 *    problem, never surfaced to the SPA as an actionable client error.
 *  - FR-004: every submitted path is validated (submit-paths.ts) and then
 *    rewritten under the keyboard's own tree prefix (applyKeyboardPrefix)
 *    before it reaches a tree entry, so a submission can never land outside
 *    release/<firstLetter>/<keyboardId>/ -- structurally, not just by check.
 *    The rejection category, never the offending path, is what a caller sees.
 */

import type { ManagedPRBody } from "./managed-pr-schemas.js";
import type { OAuthFetchFn } from "./handlers.js";
import { parseBearer, verifyGitHubUser, type GitHubUser } from "./verify-github-user.js";
import {
  applyKeyboardPrefix,
  deriveKeyboardPrefix,
  validatePackagePaths,
  type PathRejectionCategory,
} from "./submit-paths.js";

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
  /**
   * GitHub login that owns the studio's staging repo (its fork of
   * keymanapp/keyboards). In the current model this equals UPSTREAM_OWNER, so
   * commits and the PR both target this repo (same-repo PR).
   */
  orgLogin: string;
  fetch: GitHubPipelineFetchFn;
  /**
   * Verify a bearer token -> identity, or null when invalid. Deliberately the
   * same member name, shape, and injection idiom as DraftHandlerConfig.verifyUser
   * so there is exactly one identity path in the backend. Injected so tests stub
   * it; buildManagedPRConfig wires the real verifier.
   */
  verifyUser: (token: string | null) => Promise<GitHubUser | null>;
}

/**
 * Build a {@link ManagedPRPipelineConfig} wiring the real GitHub verifier, so
 * neither HTTP edge constructs `verifyUser` itself — the role
 * `buildDraftConfig` plays for the draft endpoints.
 *
 * Two fetch functions because the pipeline needs the richer
 * {@link GitHubPipelineFetchFn} (it reads Retry-After on 429) while the verifier
 * needs the looser `OAuthFetchFn`; both edges already have each in hand.
 */
export function buildManagedPRConfig(
  getInstallationToken: () => Promise<string>,
  orgLogin: string,
  pipelineFetch: GitHubPipelineFetchFn,
  oauthFetch: OAuthFetchFn
): ManagedPRPipelineConfig {
  return {
    getInstallationToken,
    orgLogin,
    fetch: pipelineFetch,
    verifyUser: (token) => verifyGitHubUser(token, oauthFetch),
  };
}

// ---------------------------------------------------------------------------
// Handler result -- mirrors handlers.ts HandlerResult, plus the extra fields
// the engine's PublishManagedPRError mapping reads (branchName / retry).
//
// Failure identifiers this module can produce:
//   401 unauthorized            -- no verified identity (missing/malformed/
//                                  invalid/expired token, or provider
//                                  unreachable: fail closed)
//   400 invalid_path            -- a submitted path is outside the permitted
//                                  tree; carries `category`, never the path
//   409 branch_exists           -- carries branchName
//   429 rate_limited            -- UPSTREAM GitHub limit; carries retryAfterSeconds
//   502 submission_unavailable / upstream_error
// ---------------------------------------------------------------------------

/**
 * Fields common to every `ok: false` shape. Both HTTP edges (server.ts,
 * api/submit/managed-pr.ts) read `branchName` / `retryAfterSeconds` /
 * `category` off the union without narrowing on `error` first, so every failure
 * variant -- including `invalid_path` below -- carries them (as `undefined`
 * where they don't apply) rather than omitting the keys outright. Omitting a key
 * here would make property access on the union a compile error at both edges for
 * a variant they don't (yet) special-case, not just a runtime no-op.
 */
type ManagedPRFailureBase = {
  ok: false;
  status: number;
  error: string;
  /** Surfaced in the 409 body so the engine maps to branch-exists. */
  branchName?: string;
  /** Surfaced via Retry-After on 429. */
  retryAfterSeconds?: number;
  /**
   * Surfaced in the 400 `invalid_path` body: the bounded rejection class, and
   * deliberately the *only* thing said about the offending path — the path
   * itself is never returned.
   */
  category?: PathRejectionCategory;
};

export type ManagedPRHandlerResult =
  | { ok: true; data: { prUrl: string; commitSha: string } }
  | (ManagedPRFailureBase & {
      status: 400;
      error: "invalid_path";
      category: PathRejectionCategory;
    })
  | ManagedPRFailureBase;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE = "https://api.github.com";
// Base repo the managed PR is opened against. The studio owns this as a staging
// repo (its own fork of keymanapp/keyboards): because the GitHub App is installed
// here, the installation token can open the PR. Opening PRs directly against a
// repo the App is NOT installed on (e.g. keymanapp/keyboards) fails 403
// "Resource not accessible by integration" -- an installation token has no
// cross-repo contributor affordance. Promotion staging -> keymanapp is a separate
// downstream step. When UPSTREAM_OWNER === orgLogin the pipeline runs as a
// same-repo PR (fork base === PR base), which is the current staging model.
// Exported so tests can pin the same-repo topology to the real constant.
export const UPSTREAM_OWNER = "keyboard-studio";
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
 * GitHub's canonical no-reply address for a verified login.
 *
 * The authorship address is DERIVED from the server-verified identity, never
 * read from the request body: the SPA only ever requests the identity sign-up
 * scope, so the verified identity carries no email, and a client-asserted
 * address would let any caller credit the commit to anyone. The no-reply form
 * is what GitHub itself uses when a user hides their address, so it is always
 * deliverable-or-inert and always parses as attribution.
 */
function noReplyEmail(user: GitHubUser): string {
  return `${user.login}@users.noreply.github.com`;
}

/**
 * Build the single-commit message: the normalized PR title followed by a
 * `Co-authored-by` trailer crediting the human author. The org account is the
 * committer; this trailer is how the human gets attribution in git history.
 *
 * `attribution.displayName` supplies the human label; `attribution.email` is
 * accepted by the schema but deliberately NOT read here — the address comes
 * from the verified identity (see {@link noReplyEmail}).
 */
export function buildCommitMessage(
  normalizedTitle: string,
  attribution: ManagedPRBody["attribution"],
  user: GitHubUser
): string {
  return `${normalizedTitle}\n\nCo-authored-by: ${attribution.displayName} <${noReplyEmail(user)}>`;
}

/**
 * Build the PR body, prepending a provenance block that names the human author
 * so downstream keymanapp/keyboards maintainers have a reachability channel. The
 * importAttribution section (when present) is appended after prBody.
 *
 * Divergence 5 from the Option A origin: Option A uses the PR body verbatim;
 * Option B must surface the human author because the committer is the org bot.
 *
 * The provenance block is the most human-read place in the submission, so the
 * address here is the server-derived one too — leaving a client-asserted email
 * in the block would preserve the impersonation vector the commit trailer just
 * closed. `body.attribution.email` is accepted by the schema and never read.
 */
export function buildPrBody(body: ManagedPRBody, user: GitHubUser): string {
  const provenance = [
    `> Submitted through **Keyboard Studio** on behalf of **${body.attribution.displayName}** (${noReplyEmail(user)}).`,
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
 * `authHeader` is the raw `Authorization` header value and is the FIRST
 * parameter, mirroring every function in draft-handlers.ts. The identity gate
 * lives here, in the shared core, rather than in the two HTTP edges: neither
 * edge can forget it because neither edge performs it.
 *
 * Returns a discriminated result (never throws) in the same shape handlers.ts
 * uses, so the route can `if (!result.ok) reply.status(result.status)`.
 *
 * Ordering is load-bearing: identity verification, then path validation,
 * both complete BEFORE getInstallationToken(), which is itself the first
 * outbound call, so a refused request (401 or invalid_path) issues zero
 * outbound GitHub calls of any kind (SC-001).
 *
 * Error mapping (all token-leak-safe):
 *  - No verified identity          -> 401 unauthorized (before any outbound call)
 *  - Path outside permitted tree   -> 400 invalid_path (+ category; before any outbound call)
 *  - Network throw                 -> 502 submission_unavailable
 *  - GitHub 401/403 (org token)    -> 502 submission_unavailable (server misconfig)
 *  - GitHub 429                    -> 429 rate_limited (+ retryAfterSeconds from header)
 *  - Branch already exists (422)   -> 409 branch_exists (+ branchName)
 *  - Any other non-ok              -> 502 upstream_error
 */
export async function submitManagedPR(
  authHeader: string | null | undefined,
  body: ManagedPRBody,
  config: ManagedPRPipelineConfig
): Promise<ManagedPRHandlerResult> {
  const { getInstallationToken, orgLogin, fetch: fetchFn } = config;

  // Identity gate FIRST -- before getInstallationToken() below, which is an
  // outbound call. verifyGitHubUser returns null for a missing, malformed,
  // invalid, expired or revoked token, and swallows its own fetch throw, so the
  // deployed path already fails closed. The try/catch makes that structural
  // rather than a property of one injected implementation: ANY verifier that
  // throws is treated as "not verified", so a future refactor cannot turn this
  // fail-open, and both HTTP edges agree on 401 instead of diverging into
  // 502 (serverless, which wraps this call) and 500 (Fastify, which does not).
  let user: GitHubUser | null;
  try {
    user = await config.verifyUser(parseBearer(authHeader));
  } catch {
    user = null;
  }
  if (user === null) return { ok: false, status: 401, error: "unauthorized" };

  // Path authority gate SECOND -- still before getInstallationToken() below, so
  // a rejected path issues zero outbound GitHub calls (SC-001). The prefix
  // length here is the TRUE post-prefix length (FR-004's length-after-prefix
  // rule), not the raw submitted-path length -- see submit-paths.ts's
  // "LENGTH-AFTER-PREFIX CHOICE". The category is all that survives into the
  // response; the offending path itself is never returned or logged (FR-015 /
  // US2 AC4).
  const pathCheck = validatePackagePaths(
    body.sourceFiles.map((f) => f.path),
    deriveKeyboardPrefix(body.keyboardId).length
  );
  if (!pathCheck.ok) {
    return { ok: false, status: 400, error: "invalid_path", category: pathCheck.category };
  }

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
    // (No "ensure the fork exists" step: under the same-repo model
    // (orgLogin === UPSTREAM_OWNER) there is no distinct upstream to fork
    // from, so a missing staging repo is a provisioning error the pipeline
    // cannot repair -- the ref read below surfaces it as upstream_error.)

    // 1. Read the staging repo's master HEAD commit SHA.
    const masterRef = await call(`${forkBase}/git/ref/heads/master`);
    if (!masterRef.ok) return mapNonOk(masterRef);
    const refData = (await masterRef.json()) as { object: { sha: string } };
    const masterCommitSha = refData.object.sha;

    // 2. Read the base tree SHA from the parent commit.
    const parentCommit = await call(`${forkBase}/git/commits/${masterCommitSha}`);
    if (!parentCommit.ok) return mapNonOk(parentCommit);
    const parentData = (await parentCommit.json()) as { tree: { sha: string } };
    const baseTreeSha = parentData.tree.sha;

    // 3. Build the tree from the SPA-filtered source files (text content only).
    // Every path is prefixed to the keyboard's own tree location
    // (release/<firstLetter>/<keyboardId>/<submitted path>) rather than
    // committed verbatim. Before this, a submission's e.g. "README.md" landed
    // at the staging repository ROOT, overwriting the repo's own README
    // (research finding F-2) -- the prefix makes writing outside the
    // keyboard's own tree structurally impossible rather than merely checked
    // by validatePackagePaths above.
    const prefixedPaths = applyKeyboardPrefix(
      body.keyboardId,
      body.sourceFiles.map((f) => f.path)
    );
    const treeEntries = body.sourceFiles.map((f, i) => ({
      // applyKeyboardPrefix maps 1:1 over the same source list built above,
      // so prefixedPaths[i] always exists for every index this map visits.
      path: prefixedPaths[i]!,
      mode: "100644",
      type: "blob",
      content: f.content,
    }));

    // 4. Create the tree.
    const newTree = await call(`${forkBase}/git/trees`, "POST", {
      base_tree: baseTreeSha,
      tree: treeEntries,
    });
    if (!newTree.ok) return mapNonOk(newTree);
    const newTreeSha = ((await newTree.json()) as { sha: string }).sha;

    // 5. Create the commit (org committer + Co-authored-by human trailer).
    const newCommit = await call(`${forkBase}/git/commits`, "POST", {
      message: buildCommitMessage(normalizedTitle, body.attribution, user),
      tree: newTreeSha,
      parents: [masterCommitSha],
    });
    if (!newCommit.ok) return mapNonOk(newCommit);
    const newCommitSha = ((await newCommit.json()) as { sha: string }).sha;

    // 6. Create the branch ref (content-unique short-SHA suffix).
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

    // 7. Open the draft PR upstream (divergences 4 and 5 from Option A).
    const pr = await call(`${upstreamBase}/pulls`, "POST", {
      title: normalizedTitle,
      body: buildPrBody(body, user),
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

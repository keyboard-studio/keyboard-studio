// see spec.md §12 — GitHub OAuth fork + draft PR submission (Option A)

import type {
  OutputService,
  VirtualFS,
  PublishPROptions,
  PublishPRResult,
  PublishPRError,
  VerifyTokenResult,
} from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Fetch abstraction — extends the base-browser FetchFn with method + body
// ---------------------------------------------------------------------------

export type GitHubFetchFn = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }
) => Promise<GitHubFetchResponse>;

export interface GitHubFetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export interface GitHubOutputConfig {
  fetch?: GitHubFetchFn;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE = "https://api.github.com";
const UPSTREAM_OWNER = "keymanapp";
const UPSTREAM_REPO = "keyboards";

// Compiled artifacts excluded from the PR commit (spec §12, criteria SS1)
const COMPILED_EXT = new Set([".kmx", ".kvk", ".js"]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isSourceFile(path: string): boolean {
  const dot = path.lastIndexOf(".");
  return dot === -1 || !COMPILED_EXT.has(path.slice(dot));
}

function buildHeaders(token: string): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

async function ghFetch(
  url: string,
  token: string,
  fetchFn: GitHubFetchFn,
  method = "GET",
  body?: unknown
): Promise<GitHubFetchResponse> {
  return fetchFn(url, {
    method,
    headers: buildHeaders(token),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function authError(res: GitHubFetchResponse): PublishPRError | null {
  if (res.status === 401) return { kind: "auth", message: "GitHub token is invalid or expired" };
  if (res.status === 403)
    return { kind: "scope", message: "Token lacks required scope", required: ["public_repo"] };
  if (res.status === 429) {
    const retry = Number(res.headers.get("Retry-After") ?? "60");
    return { kind: "rate-limit", message: "GitHub API rate limit exceeded", retryAfterSeconds: retry };
  }
  return null;
}

// ---------------------------------------------------------------------------
// verifyToken
// ---------------------------------------------------------------------------

/**
 * Verify that `token` has the scopes required for fork+PR delivery.
 * Implements {@link OutputService.verifyToken}.
 */
export async function verifyToken(
  token: string,
  fetchFn: GitHubFetchFn
): Promise<VerifyTokenResult> {
  let res: GitHubFetchResponse;
  try {
    res = await ghFetch(`${API_BASE}/user`, token, fetchFn);
  } catch (err) {
    throw { kind: "network", message: `Network error: ${String(err)}` } satisfies PublishPRError;
  }

  if (!res.ok) {
    return { ok: false, scopes: [], missingScopes: ["public_repo"] };
  }

  const data = (await res.json()) as { login?: string };
  const scopeHeader = res.headers.get("X-OAuth-Scopes") ?? "";
  const scopes = scopeHeader
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // public_repo is sufficient; repo (full) is a superset and also acceptable
  const hasAccess = scopes.includes("public_repo") || scopes.includes("repo");
  const missingScopes: string[] = hasAccess ? [] : ["public_repo"];

  return {
    ok: missingScopes.length === 0,
    ...(data.login !== undefined ? { login: data.login } : {}),
    scopes,
    missingScopes,
  };
}

// ---------------------------------------------------------------------------
// publishPR
// ---------------------------------------------------------------------------

/**
 * Fork `keymanapp/keyboards`, push the virtual FS source tree to a new
 * branch on the fork, and open a draft PR.
 *
 * Implements {@link OutputService.publishPR}.
 *
 * Compiled artifacts (`.kmx`, `.kvk`, `.js`) are excluded from the commit
 * per spec §12 / criteria SS1.  Only text source files are committed inline
 * via the GitHub Git Data API (no separate blob creation needed for text).
 *
 * @throws {PublishPRError} Discriminated union — callers should `switch` on `err.kind`.
 */
export async function publishPR(
  fs: VirtualFS,
  opts: PublishPROptions,
  fetchFn: GitHubFetchFn
): Promise<PublishPRResult> {
  const { token, forkOwner, branchName, commitMessage, prTitle, prBody } = opts;
  const forkBase = `${API_BASE}/repos/${forkOwner}/${UPSTREAM_REPO}`;
  const upstreamBase = `${API_BASE}/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}`;

  // ------------------------------------------------------------------
  // 1. Ensure the fork exists under forkOwner
  // ------------------------------------------------------------------
  let forkCheckRes: GitHubFetchResponse;
  try {
    forkCheckRes = await ghFetch(forkBase, token, fetchFn);
  } catch (err) {
    throw { kind: "network", message: `Fork check failed: ${String(err)}` } satisfies PublishPRError;
  }

  if (!forkCheckRes.ok) {
    const ae = authError(forkCheckRes);
    if (ae !== null) throw ae;
    if (forkCheckRes.status !== 404)
      throw {
        kind: "unknown",
        message: `Fork check returned HTTP ${forkCheckRes.status}`,
      } satisfies PublishPRError;

    // 404 — fork doesn't exist yet; create it
    let createRes: GitHubFetchResponse;
    try {
      createRes = await ghFetch(`${upstreamBase}/forks`, token, fetchFn, "POST", {});
    } catch (err) {
      throw { kind: "network", message: `Fork creation failed: ${String(err)}` } satisfies PublishPRError;
    }
    if (!createRes.ok) {
      const ae2 = authError(createRes);
      if (ae2 !== null) throw ae2;
      throw {
        kind: "unknown",
        message: `Fork creation returned HTTP ${createRes.status}`,
      } satisfies PublishPRError;
    }
  }

  // ------------------------------------------------------------------
  // 2. Get master HEAD commit SHA on the fork
  // ------------------------------------------------------------------
  let masterRefRes: GitHubFetchResponse;
  try {
    masterRefRes = await ghFetch(
      `${forkBase}/git/ref/heads/master`,
      token,
      fetchFn
    );
  } catch (err) {
    throw { kind: "network", message: `Could not read fork master ref: ${String(err)}` } satisfies PublishPRError;
  }
  if (!masterRefRes.ok) {
    throw {
      kind: "unknown",
      message: `Could not read fork master ref: HTTP ${masterRefRes.status}`,
    } satisfies PublishPRError;
  }
  const refData = (await masterRefRes.json()) as { object: { sha: string } };
  const masterCommitSha = refData.object.sha;

  // ------------------------------------------------------------------
  // 3. Get the base tree SHA from the parent commit
  // ------------------------------------------------------------------
  let parentCommitRes: GitHubFetchResponse;
  try {
    parentCommitRes = await ghFetch(
      `${forkBase}/git/commits/${masterCommitSha}`,
      token,
      fetchFn
    );
  } catch (err) {
    throw { kind: "network", message: `Could not read parent commit: ${String(err)}` } satisfies PublishPRError;
  }
  if (!parentCommitRes.ok) {
    throw {
      kind: "unknown",
      message: `Could not read parent commit: HTTP ${parentCommitRes.status}`,
    } satisfies PublishPRError;
  }
  const parentCommitData = (await parentCommitRes.json()) as { tree: { sha: string } };
  const baseTreeSha = parentCommitData.tree.sha;

  // ------------------------------------------------------------------
  // 4. Build tree entries — source files only, text content inline
  // ------------------------------------------------------------------
  const treeEntries = fs
    .entries()
    .filter((e) => isSourceFile(e.path) && typeof e.content === "string")
    .map((e) => ({
      path: e.path,
      mode: "100644",
      type: "blob",
      content: e.content as string,
    }));

  // ------------------------------------------------------------------
  // 5. Create the new tree
  // ------------------------------------------------------------------
  let newTreeRes: GitHubFetchResponse;
  try {
    newTreeRes = await ghFetch(`${forkBase}/git/trees`, token, fetchFn, "POST", {
      base_tree: baseTreeSha,
      tree: treeEntries,
    });
  } catch (err) {
    throw { kind: "network", message: `Tree creation failed: ${String(err)}` } satisfies PublishPRError;
  }
  if (!newTreeRes.ok) {
    const ae = authError(newTreeRes);
    if (ae !== null) throw ae;
    throw {
      kind: "unknown",
      message: `Tree creation returned HTTP ${newTreeRes.status}`,
    } satisfies PublishPRError;
  }
  const newTreeData = (await newTreeRes.json()) as { sha: string };
  const newTreeSha = newTreeData.sha;

  // ------------------------------------------------------------------
  // 6. Create the commit
  // ------------------------------------------------------------------
  let newCommitRes: GitHubFetchResponse;
  try {
    newCommitRes = await ghFetch(
      `${forkBase}/git/commits`,
      token,
      fetchFn,
      "POST",
      {
        message: commitMessage,
        tree: newTreeSha,
        parents: [masterCommitSha],
      }
    );
  } catch (err) {
    throw { kind: "network", message: `Commit creation failed: ${String(err)}` } satisfies PublishPRError;
  }
  if (!newCommitRes.ok) {
    const ae = authError(newCommitRes);
    if (ae !== null) throw ae;
    throw {
      kind: "unknown",
      message: `Commit creation returned HTTP ${newCommitRes.status}`,
    } satisfies PublishPRError;
  }
  const newCommitData = (await newCommitRes.json()) as { sha: string };
  const newCommitSha = newCommitData.sha;

  // ------------------------------------------------------------------
  // 7. Create branch ref (fail with branch-exists if already present)
  // ------------------------------------------------------------------
  let branchRes: GitHubFetchResponse;
  try {
    branchRes = await ghFetch(`${forkBase}/git/refs`, token, fetchFn, "POST", {
      ref: `refs/heads/${branchName}`,
      sha: newCommitSha,
    });
  } catch (err) {
    throw { kind: "network", message: `Branch creation failed: ${String(err)}` } satisfies PublishPRError;
  }
  if (!branchRes.ok) {
    if (branchRes.status === 422)
      throw {
        kind: "branch-exists",
        message: `Branch "${branchName}" already exists on your fork — rename and retry`,
        branchName,
      } satisfies PublishPRError;
    const ae = authError(branchRes);
    if (ae !== null) throw ae;
    throw {
      kind: "unknown",
      message: `Branch creation returned HTTP ${branchRes.status}`,
    } satisfies PublishPRError;
  }

  // ------------------------------------------------------------------
  // 8. Open draft PR on upstream
  // ------------------------------------------------------------------
  let prRes: GitHubFetchResponse;
  try {
    prRes = await ghFetch(`${upstreamBase}/pulls`, token, fetchFn, "POST", {
      title: prTitle,
      body: prBody,
      head: `${forkOwner}:${branchName}`,
      base: "master",
      draft: true,
    });
  } catch (err) {
    throw { kind: "network", message: `PR creation failed: ${String(err)}` } satisfies PublishPRError;
  }
  if (!prRes.ok) {
    const ae = authError(prRes);
    if (ae !== null) throw ae;
    throw {
      kind: "unknown",
      message: `PR creation returned HTTP ${prRes.status}`,
    } satisfies PublishPRError;
  }
  const prData = (await prRes.json()) as { html_url: string };

  return { prUrl: prData.html_url, commitSha: newCommitSha };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create an {@link OutputService} with the full GitHub OAuth fork+PR path wired up.
 * Compose with {@link createOutputService} from `./index.js` for the zip path.
 */
export function createGitHubOutputService(
  config: GitHubOutputConfig = {}
): Pick<OutputService, "verifyToken" | "publishPR"> {
  const fetchFn: GitHubFetchFn =
    config.fetch ??
    ((url, init) =>
      (globalThis as unknown as { fetch: GitHubFetchFn }).fetch(url, init));

  return {
    verifyToken: (token) => verifyToken(token, fetchFn),
    publishPR: (fs, opts) => publishPR(fs, opts, fetchFn),
  };
}

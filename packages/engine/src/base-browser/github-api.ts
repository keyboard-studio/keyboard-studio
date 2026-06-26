// see spec.md §8 step 1 — GitHub Trees API client

export type FetchFn = (
  url: string,
  init?: { headers?: Record<string, string> }
) => Promise<FetchResponse>;

interface FetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export interface GitTreeItem {
  path: string;
  mode: string;
  type: "blob" | "tree";
  sha: string;
  size?: number;
  url: string;
}

export interface GitTree {
  sha: string;
  url: string;
  tree: GitTreeItem[];
  truncated: boolean;
}

export interface GithubClientOptions {
  token?: string;
  fetch: FetchFn;
}

function buildApiHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token !== undefined) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Fetch a single git tree by ref or tree SHA.
 *
 * With `recursive: false` (default) returns just that tree's immediate
 * children — used to walk `release/` one level at a time. With
 * `recursive: true` returns the whole subtree in one round trip; for a
 * subtree SHA the entry `path`s are RELATIVE to that subtree root.
 *
 * Either form sets `truncated: true` when the result exceeds the GitHub
 * 100k-entry / 7 MB limit.
 *
 * @see https://docs.github.com/en/rest/git/trees#get-a-tree
 */
export async function fetchTree(
  owner: string,
  repo: string,
  treeIsh: string,
  options: GithubClientOptions,
  recursive = false
): Promise<GitTree> {
  const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${treeIsh}${
    recursive ? "?recursive=1" : ""
  }`;
  const res = await options.fetch(url, { headers: buildApiHeaders(options.token) });
  if (!res.ok) {
    throw new Error(`GitHub Trees API ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<GitTree>;
}

/**
 * Fetch the recursive git tree for `ref` in one round trip.
 * Returns `truncated: true` when the tree exceeds the GitHub 100k-entry limit.
 *
 * @see https://docs.github.com/en/rest/git/trees#get-a-tree
 */
export function fetchRecursiveTree(
  owner: string,
  repo: string,
  ref: string,
  options: GithubClientOptions
): Promise<GitTree> {
  return fetchTree(owner, repo, ref, options, true);
}

/**
 * Fetch the raw text content of a file from raw.githubusercontent.com.
 * Bypasses the git/blobs API so no base64 decoding is required.
 */
export async function fetchRawText(
  rawUrl: string,
  options: GithubClientOptions
): Promise<string> {
  const headers: Record<string, string> = { Accept: "text/plain" };
  if (options.token !== undefined) {
    headers["Authorization"] = `Bearer ${options.token}`;
  }
  const res = await options.fetch(rawUrl, { headers });
  if (!res.ok) {
    throw new Error(`Raw fetch ${res.status}: ${res.statusText} — ${rawUrl}`);
  }
  return res.text();
}

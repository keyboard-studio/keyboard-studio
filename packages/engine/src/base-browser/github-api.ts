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
 * Fetch the recursive git tree for `ref` in one round trip.
 * Returns `truncated: true` when the tree exceeds the GitHub 100k-entry limit.
 *
 * @see https://docs.github.com/en/rest/git/trees#get-a-tree
 */
export async function fetchRecursiveTree(
  owner: string,
  repo: string,
  ref: string,
  options: GithubClientOptions
): Promise<GitTree> {
  const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`;
  const res = await options.fetch(url, { headers: buildApiHeaders(options.token) });
  if (!res.ok) {
    throw new Error(`GitHub Trees API ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<GitTree>;
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

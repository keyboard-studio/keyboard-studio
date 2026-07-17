// see spec.md §8 step 1 — BaseBrowserService implementation (GitHub API client)

import {
  makeBaseKeyboard,
  type BaseBrowserService,
  type BaseKeyboard,
  type KeymanPlatformTarget,
} from "@keyboard-studio/contracts";
import {
  fetchRecursiveTree,
  fetchTree,
  fetchRawText,
  type FetchFn,
  type GitTree,
  type GitTreeItem,
  type GithubClientOptions,
} from "./github-api.js";
import { parseKps } from "./kps-parser.js";
import { offlineKbdus } from "./offline-bundle.js";
import { matchKeyboardScopePath } from "./corpus-scope.js";

const OWNER = "keyboard-studio";
const REPO = "keyboards";
const REF = "master";
const RAW_BASE = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${REF}`;

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export interface BaseBrowserConfig {
  /** GitHub personal access token — raises rate limit from 60 to 5000 req/hr. */
  token?: string;
  /** Override the fetch implementation; defaults to the global fetch (Node 20+ / browser). */
  fetch?: FetchFn;
}

interface CacheEntry {
  sha: string;
  keyboards: BaseKeyboard[];
  expiry: number;
}

/**
 * Resolve the full `release/` blob listing, with the commit-tree SHA for cache
 * keying. The fast path is the single recursive Trees fetch. If GitHub reports
 * that tree `truncated` (exceeds the 100k-entry / 7 MB limit), we do NOT return
 * the partial list silently (#449): we warn and reassemble the listing
 * incrementally — one bounded recursive fetch per `release/` subfolder — so a
 * large tree no longer depends on a single recursive fetch.
 */
async function collectReleaseTreeItems(
  clientOpts: GithubClientOptions
): Promise<{ items: GitTreeItem[]; sha: string }> {
  const tree = await fetchRecursiveTree(OWNER, REPO, REF, clientOpts);
  if (!tree.truncated) {
    return { items: tree.tree, sha: tree.sha };
  }
  console.warn(
    "[base-browser] keymanapp/keyboards exceeded GitHub's recursive-tree limit " +
      "(100k entries / 7 MB); falling back to an incremental per-subfolder listing" +
      (clientOpts.token === undefined
        ? ". Provide a GitHub token to raise rate limits and ensure a complete listing."
        : ".")
  );
  const items = await collectReleaseItemsIncrementally(clientOpts);
  // Keep the commit-tree SHA from the recursive call for cache keying — it
  // still identifies the ref state even though that tree came back truncated.
  return { items, sha: tree.sha };
}

/**
 * Walk `release/` one level at a time: list its immediate subfolders
 * (`release/<group>/`) via non-recursive tree reads, then recursively fetch
 * each subfolder's (bounded) subtree. Subtree entry paths are relative to the
 * subfolder root, so they are re-prefixed to full `release/<group>/…` paths.
 * Per-subfolder failures are warned and skipped rather than aborting the whole listing.
 */
async function collectReleaseItemsIncrementally(
  clientOpts: GithubClientOptions
): Promise<GitTreeItem[]> {
  const root = await fetchTree(OWNER, REPO, REF, clientOpts);
  const releaseEntry = root.tree.find(
    (t) => t.type === "tree" && t.path === "release"
  );
  if (releaseEntry === undefined) return [];

  const release = await fetchTree(OWNER, REPO, releaseEntry.sha, clientOpts);
  const groups = release.tree.filter((t) => t.type === "tree");

  const perGroup = await Promise.all(
    groups.map(async (group): Promise<GitTreeItem[]> => {
      let sub: GitTree;
      try {
        sub = await fetchTree(OWNER, REPO, group.sha, clientOpts, true);
      } catch (err) {
        console.warn(
          "[base-browser] failed to list release/" +
            group.path +
            "/; skipping (its keyboards will be missing from the gallery): " +
            (err instanceof Error ? err.message : String(err))
        );
        return [];
      }
      return sub.tree.map((item) => ({
        ...item,
        path: `release/${group.path}/${item.path}`,
      }));
    })
  );
  return perGroup.flat();
}

/**
 * Create a live {@link BaseBrowserService} that reads the
 * `keymanapp/keyboards/release/` tree via the GitHub REST API.
 *
 * Results are cached in-memory for {@link CACHE_TTL_MS} (10 min), keyed by
 * the ref SHA returned by the Trees API so stale data is never served after
 * a push.  Falls back to the offline US-English bundle on any network or
 * API error.
 *
 * @see spec.md §8 step 1
 */
export function createBaseBrowser(
  config: BaseBrowserConfig = {}
): BaseBrowserService {
  // fetch is available globally in Node 20+ (engines requirement) and browsers.
  // The dom lib isn't in this package's tsconfig; cast through unknown.
  const fetchFn: FetchFn =
    config.fetch ??
    ((url, init) =>
      (globalThis as unknown as { fetch: FetchFn }).fetch(url, init));

  let cache: CacheEntry | null = null;

  async function loadAll(): Promise<BaseKeyboard[]> {
    const now = Date.now();
    if (cache !== null && cache.expiry > now) {
      return cache.keyboards;
    }

    const clientOpts: GithubClientOptions = {
      ...(config.token !== undefined ? { token: config.token } : {}),
      fetch: fetchFn,
    };

    let items: GitTreeItem[];
    let treeSha: string;
    try {
      const collected = await collectReleaseTreeItems(clientOpts);
      items = collected.items;
      treeSha = collected.sha;
    } catch {
      return [offlineKbdus];
    }

    const kpsPaths = items
      .filter(
        (item) => item.type === "blob" && matchKeyboardScopePath(item.path) !== null
      )
      .map((item) => item.path);

    const keyboards: BaseKeyboard[] = [];

    await Promise.all(
      kpsPaths.map(async (kpsPath) => {
        const id = matchKeyboardScopePath(kpsPath)?.id;
        if (id === undefined) return;
        // The folder holding the .kps. For the Keyman 17+ "source/" layout this
        // is `release/<vendor>/<id>/source`; for the legacy flat-root layout it
        // is `release/<vendor>/<id>`.
        const folderPath = kpsPath.slice(0, kpsPath.lastIndexOf("/"));
        // BaseKeyboard.path is the keyboard ROOT (contract: e.g.
        // "release/b/basic_kbdus"). The loader appends "/source/" itself, so the
        // trailing "/source" segment must be stripped here — otherwise the loader
        // fetches ".../source/source/<id>.kmn" (404) and the base is silently
        // dropped to a stub-only scaffold.
        const keyboardRoot = folderPath.endsWith("/source")
          ? folderPath.slice(0, -"/source".length)
          : folderPath;
        try {
          const xml = await fetchRawText(`${RAW_BASE}/${kpsPath}`, clientOpts);
          const meta = parseKps(xml);
          keyboards.push(
            makeBaseKeyboard({
              id,
              path: keyboardRoot,
              displayName: meta.displayName || id,
              version: meta.version,
              script: meta.script,
              targets: meta.targets,
              // View-source link points at the folder that actually holds the
              // source files (the source/ subfolder under the modern layout).
              sourceUrl: `https://github.com/${OWNER}/${REPO}/tree/${REF}/${folderPath}`,
              ...(meta.languages.length > 0 ? { languages: meta.languages } : {}),
            })
          );
        } catch {
          // Skip this keyboard on fetch or parse failure
        }
      })
    );

    // Guarantee the offline US-English fallback is always present
    if (!keyboards.some((kb) => kb.id === offlineKbdus.id)) {
      keyboards.push(offlineKbdus);
    }

    keyboards.sort((a, b) => a.id.localeCompare(b.id));

    cache = { sha: treeSha, keyboards, expiry: now + CACHE_TTL_MS };
    return keyboards;
  }

  return {
    listAll: loadAll,

    async search(
      query: string,
      opts?: { script?: string; target?: KeymanPlatformTarget }
    ): Promise<BaseKeyboard[]> {
      const all = await loadAll();
      const q = query.toLowerCase();
      const results = all.filter((kb) => {
        const matchesQuery =
          q === "" ||
          kb.id.toLowerCase().includes(q) ||
          kb.displayName.toLowerCase().includes(q);
        const matchesScript =
          opts?.script === undefined || kb.script === opts.script;
        const matchesTarget =
          opts?.target === undefined || kb.targets.includes(opts.target);
        return matchesQuery && matchesScript && matchesTarget;
      });
      return results.sort((a, b) => a.id.localeCompare(b.id));
    },

    async getById(id: string): Promise<BaseKeyboard | undefined> {
      const all = await loadAll();
      return all.find((kb) => kb.id === id);
    },
  };
}

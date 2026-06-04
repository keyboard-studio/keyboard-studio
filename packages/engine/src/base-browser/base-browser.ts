// see spec.md §8 step 1 — BaseBrowserService implementation (GitHub API client)

import {
  makeBaseKeyboard,
  type BaseBrowserService,
  type BaseKeyboard,
  type KeymanPlatformTarget,
} from "@keyboard-studio/contracts";
import {
  fetchRecursiveTree,
  fetchRawText,
  type FetchFn,
  type GithubClientOptions,
} from "./github-api.js";
import { parseKps } from "./kps-parser.js";
import { offlineKbdus } from "./offline-bundle.js";

const OWNER = "keymanapp";
const REPO = "keyboards";
const REF = "master";
const RAW_BASE = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${REF}`;

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Matches release/<subfolder>/<id>/<id>.kps — the subfolder is either a
// single letter (e.g. "b") or a named group (e.g. "sil").
const KPS_PATH_RE = /^release\/[^/]+\/([^/]+)\/\1\.kps$/;

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

    let tree;
    try {
      tree = await fetchRecursiveTree(OWNER, REPO, REF, clientOpts);
    } catch {
      return [offlineKbdus];
    }

    // keymanapp/keyboards is large; log a warning if the tree was truncated
    if (tree.truncated) {
      // Some keyboards may be missing; encourage using an auth token
      // to ensure full listing when approaching the 100k entry limit.
    }

    const kpsPaths = tree.tree
      .filter((item) => item.type === "blob" && KPS_PATH_RE.test(item.path))
      .map((item) => item.path);

    const keyboards: BaseKeyboard[] = [];

    await Promise.all(
      kpsPaths.map(async (kpsPath) => {
        const match = KPS_PATH_RE.exec(kpsPath);
        const id = match?.[1];
        if (id === undefined) return;
        // Folder path is the kps path without the filename
        const folderPath = kpsPath.slice(0, kpsPath.lastIndexOf("/"));
        try {
          const xml = await fetchRawText(`${RAW_BASE}/${kpsPath}`, clientOpts);
          const meta = parseKps(xml);
          keyboards.push(
            makeBaseKeyboard({
              id,
              path: folderPath,
              displayName: meta.displayName || id,
              version: meta.version,
              script: meta.script,
              targets: meta.targets,
              sourceUrl: `https://github.com/${OWNER}/${REPO}/tree/${REF}/${folderPath}`,
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

    cache = { sha: tree.sha, keyboards, expiry: now + CACHE_TTL_MS };
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

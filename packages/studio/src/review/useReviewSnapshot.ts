// useReviewSnapshot — fetch a pinned keyboard snapshot into a pristine,
// read-only VFS.
//
// The snapshot is addressed by (owner, repo, sha, folder): every blob comes
// from the same pinned commit, so the report is reproducible and a later push
// (to a branch or PR) can't change what was judged.
//
// Security: the folder's file list comes from the repo tree at the pinned
// sha; every entry is validated (no `..`, no absolute paths, prefix match on
// a segment boundary) before fetching. Fetch caps bound a malicious PR's
// blast radius: over-limit files are SKIPPED with a named reason — honest,
// never silent. Nothing fetched is ever executed (see the module header in
// scripts/build-review-index.mjs and review-design.md §9).

import { useEffect, useState } from "react";
import { createVirtualFS, type VirtualFS } from "@keyboard-studio/contracts";
import type { ReviewTarget } from "./reviewSources.ts";

/** Caps bounding one snapshot fetch (review-design.md §9). */
export const SNAPSHOT_MAX_FILES = 300;
export const SNAPSHOT_MAX_FILE_BYTES = 2_000_000;
export const SNAPSHOT_MAX_TOTAL_BYTES = 50_000_000;

const BINARY_EXT = new Set([
  "ttf", "otf", "woff", "woff2", "eot",
  "png", "jpg", "jpeg", "gif", "bmp", "ico", "webp",
  "pdf", "zip", "kmx", "kvk", "js",
]);

export interface SkippedFile {
  path: string;
  reason: string;
}

export interface ReviewSnapshot {
  vfs: VirtualFS;
  skipped: SkippedFile[];
  /** Blob count fetched (excludes skipped). */
  fileCount: number;
  /**
   * Full repo tree paths at the pinned sha (published keyboards only;
   * for PR targets this is empty — the PR file list comes from
   * fetchPrContext instead). Used for the /review-only repo-context
   * checks (Batch 5 + Group C).
   */
  treePaths: string[];
}

export type SnapshotState =
  | { kind: "idle" }
  | { kind: "loading"; loaded: number; total: number }
  | { kind: "ready"; snapshot: ReviewSnapshot }
  | { kind: "error"; message: string };

interface TreeEntry {
  path?: string;
  size?: number;
  type?: string;
}

function isSafeEntry(repoPath: string, folder: string): boolean {
  if (!repoPath.startsWith(folder + "/")) return false;
  const rest = repoPath.slice(folder.length + 1);
  if (rest === "" || rest.includes("..")) return false;
  if (rest.startsWith("/")) return false;
  return true;
}

/**
 * Fetch the snapshot. Exported pure-ish (no React) for tests.
 * `fetchImpl` defaults to global fetch; tests inject a stub.
 */
export async function fetchSnapshot(
  target: ReviewTarget,
  onProgress?: (loaded: number, total: number) => void,
  fetchImpl: typeof fetch = fetch,
): Promise<ReviewSnapshot> {
  const { owner, repo, sha, path: folder } = target;

  // 1. Enumerate the folder at the pinned sha.
  const treeRes = await fetchImpl(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`,
    { headers: { Accept: "application/vnd.github+json" } },
  );
  if (!treeRes.ok) {
    throw new Error(`repo tree API: HTTP ${treeRes.status}`);
  }
  const tree = (await treeRes.json()) as {
    tree?: TreeEntry[];
    truncated?: boolean;
  };
  if (tree.truncated) {
    throw new Error(
      "keyboard tree is too large to enumerate — refusing to judge a partial file list",
    );
  }
  const allPaths = (tree.tree ?? [])
    .filter((e) => e.type === "blob" && typeof e.path === "string")
    .map((e) => e.path as string);
  const entries = (tree.tree ?? []).filter(
    (e) => e.type === "blob" && typeof e.path === "string" && isSafeEntry(e.path, folder),
  );
  if (entries.length === 0) {
    throw new Error(`no files found under ${folder} @ ${sha.slice(0, 7)}`);
  }

  // 2. Apply caps.
  const skipped: SkippedFile[] = [];
  const wanted: TreeEntry[] = [];
  let totalBytes = 0;
  for (const e of entries) {
    const size = e.size ?? 0;
    if (wanted.length >= SNAPSHOT_MAX_FILES) {
      skipped.push({ path: e.path!, reason: `over file-count cap (${SNAPSHOT_MAX_FILES})` });
      continue;
    }
    if (size > SNAPSHOT_MAX_FILE_BYTES) {
      skipped.push({ path: e.path!, reason: `over per-file cap (${SNAPSHOT_MAX_FILE_BYTES} bytes)` });
      continue;
    }
    if (totalBytes + size > SNAPSHOT_MAX_TOTAL_BYTES) {
      skipped.push({ path: e.path!, reason: `over total-bytes cap (${SNAPSHOT_MAX_TOTAL_BYTES})` });
      continue;
    }
    totalBytes += size;
    wanted.push(e);
  }

  // 3. Fetch blobs at the pinned sha; store folder-relative in the VFS.
  const vfs = createVirtualFS();
  let loaded = 0;
  for (const e of wanted) {
    const repoPath = e.path!;
    const rel = repoPath.slice(folder.length + 1);
    const ext = rel.split(".").pop()?.toLowerCase() ?? "";
    const url = `/review-proxy/${owner}/${repo}/${sha}/${repoPath}`;
    const res = await fetchImpl(url);
    if (!res.ok) {
      skipped.push({ path: rel, reason: `fetch failed: HTTP ${res.status}` });
      continue;
    }
    if (BINARY_EXT.has(ext)) {
      const buf = await res.arrayBuffer();
      vfs.set(rel, new Uint8Array(buf), true);
    } else {
      const text = await res.text();
      vfs.set(rel, text, false);
    }
    loaded += 1;
    onProgress?.(loaded, wanted.length);
  }

  return { vfs, skipped, fileCount: loaded, treePaths: allPaths };
}

export function useReviewSnapshot(
  target: ReviewTarget | null,
  /** Bump to re-fire the fetch (Re-run). */
  runToken = 0,
): SnapshotState {
  const [state, setState] = useState<SnapshotState>({ kind: "idle" });

  useEffect(() => {
    if (!target) {
      setState({ kind: "idle" });
      return;
    }
    let cancelled = false;
    setState({ kind: "loading", loaded: 0, total: 0 });
    fetchSnapshot(
      target,
      (loaded, total) => {
        if (!cancelled) setState({ kind: "loading", loaded, total });
      },
    )
      .then((snapshot) => {
        if (!cancelled) setState({ kind: "ready", snapshot });
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setState({
            kind: "error",
            message: e instanceof Error ? e.message : String(e),
          });
        }
      });
    return () => {
      cancelled = true;
    };
    // Intentional scalar deps (not `target`): the parent may rebuild the
    // target object per render; refiring on identity would re-fetch needlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    target?.source,
    target?.owner,
    target?.repo,
    target?.path,
    target?.sha,
    runToken,
  ]);

  return state;
}

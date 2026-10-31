// useReviewIndex — loads the static review index (emitted by
// scripts/build-review-index.mjs) and serves the picker.
//
// Repo-branch keyboards come from the index. Open PRs come from the index
// too (number/title/head sha); the keyboards inside one PR are resolved live
// from the PR's file list via the anonymous GitHub API.

import { useEffect, useMemo, useState } from "react";
import type {
  ReviewIndex,
  ReviewKeyboardEntry,
  ReviewPrEntry,
  ReviewSourceId,
} from "./reviewSources.ts";
import { reviewSourceById } from "./reviewSources.ts";

export interface ReviewIndexState {
  index: ReviewIndex | null;
  error: string | null;
}

export function useReviewIndex(): ReviewIndexState {
  const [index, setIndex] = useState<ReviewIndex | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/review-index.json", { headers: { Accept: "application/json" } })
      .then((r) => {
        if (!r.ok) throw new Error(`review-index.json: HTTP ${r.status}`);
        return r.json();
      })
      .then((data: ReviewIndex) => {
        if (!cancelled) setIndex(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { index, error };
}

/** Keyboards for a repo source, filtered by the search query. */
export function useRepoKeyboards(
  index: ReviewIndex | null,
  source: ReviewSourceId,
  query: string,
): ReviewKeyboardEntry[] {
  return useMemo(() => {
    if (!index) return [];
    const src = reviewSourceById(source);
    if (src.kind !== "repo") return [];
    const key = source === "ks-repo" ? "ks" : "km";
    const all = index.repos[key]?.keyboards ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return all.slice(0, 200); // cap the unfiltered render
    return all
      .filter(
        (k) =>
          k.id.toLowerCase().includes(q) ||
          k.displayName.toLowerCase().includes(q) ||
          k.path.toLowerCase().includes(q),
      )
      .slice(0, 200);
  }, [index, source, query]);
}

/** Open PRs for a PR source, filtered by the search query. */
export function useOpenPrs(
  index: ReviewIndex | null,
  source: ReviewSourceId,
  query: string,
): ReviewPrEntry[] {
  return useMemo(() => {
    if (!index) return [];
    const src = reviewSourceById(source);
    if (src.kind !== "prs") return [];
    const key = source === "ks-prs" ? "ks" : "km";
    const all = index.prs[key] ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (p) =>
        String(p.number).includes(q) || p.title.toLowerCase().includes(q),
    );
  }, [index, source, query]);
}

/**
 * Keyboards touched by one PR, derived live from the PR's file list.
 * A keyboard folder is `<tier>/<group>/<id>/` (tier = release|experimental|legacy).
 * Anonymous API; results cached per PR number for the session.
 */
const prKeyboardCache = new Map<string, Promise<ReviewKeyboardEntry[]>>();

export function fetchPrKeyboards(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<ReviewKeyboardEntry[]> {
  const key = `${owner}/${repo}#${prNumber}`;
  const cached = prKeyboardCache.get(key);
  if (cached) return cached;
  const p = (async () => {
    const out = new Map<string, ReviewKeyboardEntry>();
    let page = 1;
    for (;;) {
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100&page=${page}`,
        { headers: { Accept: "application/vnd.github+json" } },
      );
      if (!res.ok) throw new Error(`PR files API: HTTP ${res.status}`);
      const files = (await res.json()) as Array<{ filename?: string }>;
      if (!Array.isArray(files) || files.length === 0) break;
      for (const f of files) {
        const m = /^(release|experimental|legacy)\/([^/]+)\/([^/]+)\//.exec(
          f.filename ?? "",
        );
        if (!m) continue;
        const id = m[3]!;
        const path = `${m[1]}/${m[2]}/${id}`;
        if (!out.has(path)) {
          out.set(path, { id, displayName: id, path, tier: m[1]! });
        }
      }
      if (files.length < 100 || page >= 10) break;
      page += 1;
    }
    return [...out.values()].sort((a, b) => a.id.localeCompare(b.id));
  })();
  prKeyboardCache.set(key, p);
  return p;
}

/** PR context for the /review-only checks: changed files + description. */
export interface PrContext {
  /** Repo-relative paths of the PR's changed files. */
  filePaths: string[];
  /** The PR description (body), or "" when empty. */
  body: string;
}

const prContextCache = new Map<string, Promise<PrContext>>();

/**
 * Fetch a PR's changed-file list and body for the /review-only checks
 * (Batch 5 + Group C). Session-cached like fetchPrKeyboards.
 */
export function fetchPrContext(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<PrContext> {
  const key = `${owner}/${repo}#${prNumber}:ctx`;
  const cached = prContextCache.get(key);
  if (cached) return cached;
  const p = (async () => {
    const [prRes, filesRes] = await Promise.all([
      fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`, {
        headers: { Accept: "application/vnd.github+json" },
      }),
      fetch(
        `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100`,
        { headers: { Accept: "application/vnd.github+json" } },
      ),
    ]);
    if (!prRes.ok) throw new Error(`PR API: HTTP ${prRes.status}`);
    if (!filesRes.ok) throw new Error(`PR files API: HTTP ${filesRes.status}`);
    const pr = (await prRes.json()) as { body?: string | null };
    const files = (await filesRes.json()) as Array<{ filename?: string }>;
    return {
      filePaths: (Array.isArray(files) ? files : [])
        .map((f) => f.filename ?? "")
        .filter((n) => n !== ""),
      body: pr.body ?? "",
    };
  })();
  prContextCache.set(key, p);
  return p;
}

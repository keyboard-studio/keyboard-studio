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

/** PR author info for the §17 Build Trigger context (first-time contributor). */
export interface PrAuthorInfo {
  /** The PR author's GitHub login. */
  login: string;
  /** True when this is the author's first PR to the repo. */
  isFirstPr: boolean;
  /** Total PRs by this author to the repo (including this one). */
  prCount: number;
}

const prAuthorCache = new Map<string, Promise<PrAuthorInfo | null>>();

/**
 * Fetch a PR's author and whether it's their first PR to the repo.
 * Uses the search API for the author's PR count. Session-cached like
 * fetchPrKeyboards. Returns null on API failure — never breaks the review.
 */
export function fetchPrAuthorInfo(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<PrAuthorInfo | null> {
  const key = `${owner}/${repo}#${prNumber}:author`;
  const cached = prAuthorCache.get(key);
  if (cached) return cached;
  const p = (async (): Promise<PrAuthorInfo | null> => {
    try {
      const prRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
        { headers: { Accept: "application/vnd.github+json" } },
      );
      if (!prRes.ok) return null;
      const pr = (await prRes.json()) as { user?: { login?: string } | null };
      const login = pr.user?.login;
      if (!login) return null;

      // Count the author's PRs to this repo (open + closed).
      const searchRes = await fetch(
        `https://api.github.com/search/issues?q=${encodeURIComponent(
          `repo:${owner}/${repo} type:pr author:${login}`,
        )}&per_page=1`,
        { headers: { Accept: "application/vnd.github+json" } },
      );
      if (!searchRes.ok) return null;
      const search = (await searchRes.json()) as { total_count?: number };
      const prCount = typeof search.total_count === "number" ? search.total_count : 0;
      return { login, isFirstPr: prCount <= 1, prCount };
    } catch {
      return null;
    }
  })();
  prAuthorCache.set(key, p);
  return p;
}

/** PR context for the /review-only checks: changed files + description. */
export interface PrContext {
  /** Repo-relative paths of the PR's changed files. */
  filePaths: string[];
  /** The PR description (body), or "" when empty. */
  body: string;
  /** The PR's base commit sha (the commit before the PR's changes). */
  baseSha: string;
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
    const pr = (await prRes.json()) as {
      body?: string | null;
      base?: { sha?: string } | null;
    };
    const files = (await filesRes.json()) as Array<{ filename?: string }>;
    return {
      filePaths: (Array.isArray(files) ? files : [])
        .map((f) => f.filename ?? "")
        .filter((n) => n !== ""),
      body: pr.body ?? "",
      baseSha: pr.base?.sha ?? "",
    };
  })();
  prContextCache.set(key, p);
  return p;
}

/**
 * Criterion 1.5's base-commit lookup (Matthew's insight: "you just have
 * to check the commit before the PR"): the tiers of
 * experimental/legacy/release where the keyboard's folder already
 * exists at the PR's base sha.
 *
 * Returns null when the lookup fails (API error) or the base sha is
 * unknown — the caller leaves the field absent and the assembly names
 * the missing input, never a pass or fail.
 */
export interface IdConflictAtBase {
  baseSha: string;
  /** Tiers where `{tier}/{org}/{id}/` exists at the base commit. */
  existingTiers: string[];
}

const idConflictCache = new Map<string, Promise<IdConflictAtBase | null>>();

const ID_CHECK_TIERS = ["experimental", "release", "legacy"] as const;
export function fetchIdConflictAtBase(
  owner: string,
  repo: string,
  prNumber: number,
  /** The keyboard's repo folder, e.g. "experimental/g/gikuyukanya". */
  targetPath: string,
): Promise<IdConflictAtBase | null> {
  const key = `${owner}/${repo}#${prNumber}:idconflict:${targetPath}`;
  const cached = idConflictCache.get(key);
  if (cached) return cached;
  const p = (async (): Promise<IdConflictAtBase | null> => {
    try {
      const pr = await fetchPrContext(owner, repo, prNumber);
      const baseSha = pr.baseSha;
      if (!baseSha) return null;
      const segments = targetPath.split("/").filter((s) => s !== "");
      // targetPath is tier/org/id; check the same org/id under each tier.
      const org = segments[1] ?? "";
      const id = segments[segments.length - 1] ?? "";
      if (!org || !id) return null;
      const existingTiers: string[] = [];
      for (const tier of ID_CHECK_TIERS) {
        const folder = `${tier}/${org}/${id}`;
        const res = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/contents/${folder}?ref=${baseSha}`,
          { headers: { Accept: "application/vnd.github+json" } },
        );
        if (res.ok) {
          existingTiers.push(tier);
        } else if (res.status !== 404) {
          // Anything but "not found" is a lookup failure, not a pass.
          return null;
        }
      }
      return { baseSha, existingTiers };
    } catch {
      return null;
    }
  })();
  idConflictCache.set(key, p);
  return p;
}

/**
 * Parse a .kmn's declared version: store(&KEYBOARDVERSION) wins, then
 * store(&VERSION) — mirroring the IR parser's `keyboardVersion || version`.
 */
function parseKmnVersionText(kmnText: string): string | undefined {
  const kv = /store\s*\(\s*&KEYBOARDVERSION\s*\)\s*["']([^"']*)["']/i.exec(kmnText);
  if (kv && kv[1]!.trim() !== "") return kv[1]!.trim();
  const v = /store\s*\(\s*&VERSION\s*\)\s*["']([^"']*)["']/i.exec(kmnText);
  if (v && v[1]!.trim() !== "") return v[1]!.trim();
  return undefined;
}

/**
 * Criterion 2.6's base-commit lookup: the judged .kmn's declared
 * version at the PR's base sha.
 *
 * Returns null on API failure (the caller leaves the field absent and
 * the assembly names the missing input). A 404 — the .kmn is new at
 * the base — returns a present entry with no version: nothing to
 * increment from, not a lookup failure.
 */
const baseKmnVersionCache = new Map<
  string,
  Promise<{ baseSha: string; version?: string } | null>
>();

export function fetchBaseKmnVersion(
  owner: string,
  repo: string,
  prNumber: number,
  /** Repo-relative .kmn path, e.g. "experimental/g/foo/source/foo.kmn". */
  kmnRepoPath: string,
): Promise<{ baseSha: string; version?: string } | null> {
  const key = `${owner}/${repo}#${prNumber}:basever:${kmnRepoPath}`;
  const cached = baseKmnVersionCache.get(key);
  if (cached) return cached;
  const p = (async (): Promise<{ baseSha: string; version?: string } | null> => {
    try {
      const pr = await fetchPrContext(owner, repo, prNumber);
      const baseSha = pr.baseSha;
      if (!baseSha) return null;
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${kmnRepoPath}?ref=${baseSha}`,
        { headers: { Accept: "application/vnd.github+json" } },
      );
      if (res.status === 404) return { baseSha };
      if (!res.ok) return null;
      const body = (await res.json()) as {
        content?: string;
        encoding?: string;
      };
      if (typeof body.content !== "string" || body.encoding !== "base64")
        return null;
      const text = atob(body.content);
      const version = parseKmnVersionText(text);
      return version === undefined ? { baseSha } : { baseSha, version };
    } catch {
      return null;
    }
  })();
  baseKmnVersionCache.set(key, p);
  return p;
}

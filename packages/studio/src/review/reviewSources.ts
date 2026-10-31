// reviewSources — the four allowed sources for the /review Health Check.
//
// The picker is constrained to exactly these: two repos × (branch | open PRs).
// No uploads, no pasted URLs, no keyman.com downloads, no studio projects.
// Both repos are public, so every fetch below is anonymous.

export type ReviewSourceId = "ks-repo" | "ks-prs" | "km-repo" | "km-prs";

export interface ReviewSource {
  id: ReviewSourceId;
  /** Short repo label shown on cards, e.g. "keyboard-studio/keyboards". */
  repoLabel: string;
  owner: string;
  repo: string;
  kind: "repo" | "prs";
  /** Human blurb for the source card. */
  blurb: string;
}

export const REVIEW_SOURCES: readonly ReviewSource[] = [
  {
    id: "ks-repo",
    repoLabel: "keyboard-studio/keyboards",
    owner: "keyboard-studio",
    repo: "keyboards",
    kind: "repo",
    blurb: "Repo · default branch · curated studio submissions",
  },
  {
    id: "ks-prs",
    repoLabel: "keyboard-studio/keyboards",
    owner: "keyboard-studio",
    repo: "keyboards",
    kind: "prs",
    blurb: "Open pull requests · proposed additions & fixes",
  },
  {
    id: "km-repo",
    repoLabel: "keymanapp/keyboards",
    owner: "keymanapp",
    repo: "keyboards",
    kind: "repo",
    blurb: "Repo · default branch · the upstream Keyman library",
  },
  {
    id: "km-prs",
    repoLabel: "keymanapp/keyboards",
    owner: "keymanapp",
    repo: "keyboards",
    kind: "prs",
    blurb: "Open pull requests · upstream proposals",
  },
];

export function reviewSourceById(id: ReviewSourceId): ReviewSource {
  const s = REVIEW_SOURCES.find((x) => x.id === id);
  if (!s) throw new Error(`unknown review source: ${id}`);
  return s;
}

/** One keyboard in a repo branch, from the static review index. */
export interface ReviewKeyboardEntry {
  id: string;
  displayName: string;
  /** Repo-relative folder, e.g. "release/gff/gff_amharic". */
  path: string;
  tier: "release" | "experimental" | "legacy" | string;
}

/** One open PR, from the static review index. Per-PR keyboard folders are
 *  resolved live from the PR's file list (PR heads move; a static snapshot
 *  of PR contents would go stale fast). */
export interface ReviewPrEntry {
  number: number;
  title: string;
  headSha: string;
  updatedAt: string | null;
}

export interface ReviewIndex {
  generatedAt: string;
  repos: Record<
    string,
    {
      owner: string;
      repo: string;
      ref: string;
      sha: string;
      keyboards: ReviewKeyboardEntry[];
    }
  >;
  prs: Record<string, ReviewPrEntry[]>;
}

/** The pinned target of one health-check run. Everything downstream keys
 *  off this: the snapshot fetch, the report header, and the shareable link. */
export interface ReviewTarget {
  source: ReviewSourceId;
  owner: string;
  repo: string;
  /** Repo-relative keyboard folder. */
  path: string;
  keyboardId: string;
  displayName: string;
  /** Exact commit sha judged. For PRs this is the head sha resolved at
   *  snapshot time — the report pins it, so a later push can't change what
   *  the report means. */
  sha: string;
  prNumber?: number;
  prTitle?: string;
}

export function reviewTargetLabel(t: ReviewTarget): string {
  const src = reviewSourceById(t.source);
  const pr = t.prNumber !== undefined ? ` PR #${t.prNumber}` : "";
  return `${src.repoLabel}${pr} · ${t.path} @ ${t.sha.slice(0, 7)}`;
}

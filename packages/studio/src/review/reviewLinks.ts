// reviewLinks — hard-link URL helpers for the /review health check.
//
// Hard links:
//   /review/<owner>/keyboards/pull/<N>      — a PR (auto-runs when it touches
//                                            exactly one keyboard)
//   /review/<owner>/keyboards/<kb-path...>  — a published keyboard at the
//                                            index HEAD (auto-runs)
//
// Only the two repos are linkable: keyboard-studio/keyboards and
// keymanapp/keyboards. Anything else falls through to the picker.

import type { ReviewSourceId, ReviewTarget } from "./reviewSources.ts";

export type ReviewPathLink =
  | { kind: "pr"; owner: string; prNumber: number }
  | { kind: "repo"; owner: string; keyboardPath: string };

/**
 * Parse a /review hard link path. Returns null for the bare /review
 * (picker) or unrecognized shapes.
 */
export function parseReviewPath(pathname: string): ReviewPathLink | null {
  const m = /^\/review\/([^/]+)\/keyboards\/(.+)$/.exec(pathname);
  if (!m) return null;
  const owner = m[1]!;
  const rest = m[2]!;
  const prMatch = /^pull\/(\d+)$/.exec(rest);
  if (prMatch) {
    return { kind: "pr", owner, prNumber: Number(prMatch[1]) };
  }
  // Anything else is a keyboard path under the repo.
  if (rest.includes("..")) return null;
  return { kind: "repo", owner, keyboardPath: rest };
}

/** Map a repo owner to the review source ids. Null for anything else. */
export function ownerToSources(owner: string): {
  repo: ReviewSourceId;
  prs: ReviewSourceId;
  key: string;
} | null {
  if (owner === "keyboard-studio")
    return { repo: "ks-repo", prs: "ks-prs", key: "ks" };
  if (owner === "keymanapp") return { repo: "km-repo", prs: "km-prs", key: "km" };
  return null;
}

/**
 * Build the hard-link URL path for a review target.
 * /review/<owner>/keyboards/pull/<N> or /review/<owner>/keyboards/<path>.
 */
export function hardLinkForTarget(target: ReviewTarget): string {
  if (target.prNumber !== undefined) {
    return `/review/${target.owner}/keyboards/pull/${target.prNumber}`;
  }
  return `/review/${target.owner}/keyboards/${target.path}`;
}

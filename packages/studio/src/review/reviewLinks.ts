// reviewLinks — hard-link URL helpers for the /review health check.
//
// Hard links:
//   /review/<owner>/keyboards/pull/<N>[/<kb-path>]  — a PR (auto-runs when
//                                            it touches exactly one keyboard,
//                                            or the one named by <kb-path>)
//   /review/<owner>/keyboards/<kb-path...>  — a published keyboard at the
//                                            index HEAD (auto-runs)
//
// GitHub URL shapes are accepted too, so a pasted link works:
// /review/https://github.com/<owner>/keyboards/pull/<N>/files and
// /review/<owner>/keyboards/tree/<branch>/<kb-path>/source/x.kmn.
//
// Only the two repos are linkable: keyboard-studio/keyboards and
// keymanapp/keyboards. Anything else falls through to the picker.

import type { ReviewSourceId, ReviewTarget } from "./reviewSources.ts";

export type ReviewPathLink =
  | { kind: "pr"; owner: string; prNumber: number; keyboardPath?: string }
  | { kind: "repo"; owner: string; keyboardPath: string };

/** A keyboard folder: <tier>/<group>/<id>, ignoring anything below it. */
const KEYBOARD_FOLDER = /^(?:release|experimental|legacy)\/[^/]+\/[^/]+/;

/**
 * Parse a /review hard link path. Returns null for the bare /review
 * (picker) or unrecognized shapes.
 */
export function parseReviewPath(pathname: string): ReviewPathLink | null {
  const normalized = pathname.replace(/^\/review\/https?:\/+github\.com\//, "/review/");
  const m = /^\/review\/([^/]+)\/keyboards\/(.+)$/.exec(normalized);
  if (!m) return null;
  const owner = m[1]!;
  const rest = m[2]!;
  if (rest.split("/").includes("..")) return null;
  const prMatch = /^pull\/(\d+)(?:\/(.*))?$/.exec(rest);
  if (prMatch) {
    const keyboardPath = KEYBOARD_FOLDER.exec(prMatch[2] ?? "")?.[0];
    return {
      kind: "pr",
      owner,
      prNumber: Number(prMatch[1]),
      ...(keyboardPath !== undefined ? { keyboardPath } : {}),
    };
  }
  const keyboardPath = KEYBOARD_FOLDER.exec(rest.replace(/^(?:tree|blob)\/[^/]+\//, ""))?.[0];
  return keyboardPath !== undefined ? { kind: "repo", owner, keyboardPath } : null;
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
 * /review/<owner>/keyboards/pull/<N>/<path> or /review/<owner>/keyboards/<path>.
 */
export function hardLinkForTarget(target: ReviewTarget): string {
  if (target.prNumber !== undefined) {
    return `/review/${target.owner}/keyboards/pull/${target.prNumber}/${target.path}`;
  }
  return `/review/${target.owner}/keyboards/${target.path}`;
}

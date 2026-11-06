// Source choice for Open (spec 111 US4): the same keyboard can live in both
// keymanapp/keyboards and keyboard-studio/keyboards, and the two copies can
// differ. This resolves each repository's copy at its last-change commit,
// compares the `.kmn` and `.kps` text, and says which side is newer.
//
// Each copy is read through `/review-proxy/:owner/:repo/:sha/:path*`, so the
// text judged is the text at a pinned commit, not a moving branch head.

import { createVirtualFS, type SourceRef, type StartKeyboard } from "@keyboard-studio/contracts";
import { fetchKeyboardSourceToVfs, type FetchFn } from "@keyboard-studio/engine";

export type SourceOwner = SourceRef["owner"];

const UPSTREAM: SourceOwner = "keymanapp";
const FORK: SourceOwner = "keyboard-studio";
const REPO = "keyboards";

/** One repository's copy of the keyboard, pinned at its last-change commit. */
export interface SourceCopy {
  owner: SourceOwner;
  /** Full SHA of the latest commit that touched the keyboard's folder. */
  commit: string;
  /** ISO commit date of that commit. */
  committedAt: string;
  kmn: string;
  /** Null when the copy has no `.kps`. */
  kps: string | null;
}

export interface SourceChoice {
  upstream: SourceCopy | null;
  fork: SourceCopy | null;
  /** Both copies exist and their `.kmn` or `.kps` text differs. */
  differ: boolean;
}

function readText(vfs: ReturnType<typeof createVirtualFS>, path: string): string | null {
  const content = vfs.get(path)?.content;
  return typeof content === "string" ? content : null;
}

/** The latest commit touching `keyboard.path` in `owner/keyboards`, or null. */
async function lastChangeCommit(
  owner: SourceOwner,
  keyboard: StartKeyboard,
  fetchImpl: FetchFn,
): Promise<{ sha: string; date: string } | null> {
  const url =
    `https://api.github.com/repos/${owner}/${REPO}/commits` +
    `?path=${encodeURIComponent(keyboard.path)}&per_page=1`;
  const res = await fetchImpl(url, { headers: { Accept: "application/vnd.github+json" } });
  if (!res.ok) return null;
  const body: unknown = JSON.parse(await res.text());
  if (!Array.isArray(body) || body.length === 0) return null;
  const first = body[0] as {
    sha?: unknown;
    commit?: { committer?: { date?: unknown }; author?: { date?: unknown } };
  };
  const date = first.commit?.committer?.date ?? first.commit?.author?.date;
  if (typeof first.sha !== "string" || typeof date !== "string") return null;
  return { sha: first.sha, date };
}

/** One side's copy, or null when the repository does not carry the keyboard. */
async function resolveCopy(
  owner: SourceOwner,
  keyboard: StartKeyboard,
  fetchImpl: FetchFn,
): Promise<SourceCopy | null> {
  try {
    const commit = await lastChangeCommit(owner, keyboard, fetchImpl);
    if (commit === null) return null;
    const vfs = createVirtualFS();
    await fetchKeyboardSourceToVfs(keyboard, vfs, {
      proxyBase: `/review-proxy/${owner}/${REPO}/${commit.sha}`,
      fetchImpl,
      keepKps: true,
    });
    const kmn = readText(vfs, `source/${keyboard.id}.kmn`);
    if (kmn === null) return null;
    return {
      owner,
      commit: commit.sha,
      committedAt: commit.date,
      kmn,
      kps: readText(vfs, `source/${keyboard.id}.kps`),
    };
  } catch {
    // A missing keyboard, an unreachable proxy or a rate-limited API all mean
    // "this side has no usable copy"; the other side is still openable.
    return null;
  }
}

/** Resolve both repositories' copies of `keyboard` and compare them. */
export async function resolveSourceChoice(
  keyboard: StartKeyboard,
  fetchImpl: FetchFn = globalThis.fetch.bind(globalThis) as unknown as FetchFn,
): Promise<SourceChoice> {
  const [upstream, fork] = await Promise.all([
    resolveCopy(UPSTREAM, keyboard, fetchImpl),
    resolveCopy(FORK, keyboard, fetchImpl),
  ]);
  const differ =
    upstream !== null && fork !== null && (upstream.kmn !== fork.kmn || upstream.kps !== fork.kps);
  return { upstream, fork, differ };
}

/** True when the fork's copy is the newer of two differing copies (curated there). */
export function forkIsNewer(choice: SourceChoice): boolean {
  if (!choice.differ || choice.upstream === null || choice.fork === null) return false;
  return Date.parse(choice.fork.committedAt) > Date.parse(choice.upstream.committedAt);
}

/** The SourceRef for opening `owner`'s copy, or null when that copy is unavailable. */
export function sourceRefFor(
  choice: SourceChoice,
  keyboard: StartKeyboard,
  owner: SourceOwner,
): SourceRef | null {
  const chosen = owner === UPSTREAM ? choice.upstream : choice.fork;
  const other = owner === UPSTREAM ? choice.fork : choice.upstream;
  if (chosen === null) return null;
  const alternative =
    choice.differ && other !== null
      ? {
          owner: other.owner,
          commit: other.commit,
          newer: Date.parse(other.committedAt) > Date.parse(chosen.committedAt),
        }
      : null;
  return { owner, repo: REPO, commit: chosen.commit, path: keyboard.path, alternative };
}

/** Opening upstream would replace a newer, differing copy in the studio's repository. */
export function replacesCuratedCopy(ref: SourceRef | null): boolean {
  return ref !== null && ref.owner === UPSTREAM && ref.alternative?.owner === FORK && ref.alternative.newer;
}

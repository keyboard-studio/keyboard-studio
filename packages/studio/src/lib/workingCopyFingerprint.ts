// workingCopyFingerprint — what a test build was made from, as one hash
// (spec 094 research R7).
//
// SHA-256 over the stable publish projection: the files that would ship,
// with the clock-derived HISTORY date / LICENSE year pinned and the publish
// version resolved as if test builds exist (serializeWorkingCopy's
// `stableForFingerprint`). Two builds with no edit between them hash the same,
// so the list can say "Same as build N" and the publish hand-over can say
// whether anything changed since the last build.
//
// Computed on user action only (making a build, opening the hand-over) —
// never inside the validation cycle (D3).

import type { VirtualFSEntry } from "@keyboard-studio/contracts";
import { computeSha256Hex } from "@keyboard-studio/engine";
import { serializeEntry } from "./persistWorkingCopy.ts";
import { projectWorkingCopyForOutput } from "./serializeWorkingCopy.ts";

/** Hash a file tree independent of entry order; binary entries hash as their Base64 text. */
export async function fingerprintEntries(entries: readonly VirtualFSEntry[]): Promise<string> {
  const lines = entries
    .map(serializeEntry)
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((e) => `${e.path}\0${e.isBinary ? "b" : "t"}\0${e.content}`);
  return computeSha256Hex(lines.join("\n"));
}

/** The current working copy's fingerprint, or null when nothing is instantiated. */
export async function computeWorkingCopyFingerprint(): Promise<string | null> {
  const projected = await projectWorkingCopyForOutput({ stableForFingerprint: true });
  return projected === null ? null : fingerprintEntries(projected.vfs.entries());
}

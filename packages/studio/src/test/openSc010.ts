// SC-010 assertion helper (spec 111 "live files", T097): after an applied change on
// an opened keyboard, every file the change touched reads byte-for-byte the same in
// the code view (the working copy's own file), in what the preview compiles and in
// the download. Only the release version lines and HISTORY may differ in the download.
// Real projection on every route; the caller mocks `lib/services.ts` as the other
// Open parity tests do.

import { renderHook } from "@testing-library/react";
import { createVirtualFS, type VirtualFS } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useWorkingCopyTransform } from "../hooks/useWorkingCopyTransform.ts";
import { projectWorkingCopyForOutput } from "../lib/serializeWorkingCopy.ts";
import { readVfsText } from "../lib/vfsText.ts";

/** Drops the lines/elements the release version bump owns, so only live-file text is compared. */
export function normaliseVersion(path: string, text: string): string {
  if (/\.kmn$/i.test(path)) {
    return text.split(/(?<=\n)/).filter((l) => !/&KEYBOARDVERSION|&VERSION/i.test(l)).join("");
  }
  if (/\.kps$/i.test(path)) return text.replace(/<Version[^>]*>[^<]*<\/Version>/g, "<Version/>");
  return text;
}

const isHistory = (path: string): boolean => /(^|\/)HISTORY(\.md)?$/i.test(path);

/** Text of every text file in a VFS, by path. */
export function snapshotText(vfs: VirtualFS): Map<string, string> {
  const out = new Map<string, string>();
  for (const e of vfs.entries()) if (typeof e.content === "string") out.set(e.path, e.content);
  return out;
}

/** Paths whose text differs between two snapshots (changed, added or removed). */
export function touchedPaths(before: Map<string, string>, after: Map<string, string>): string[] {
  const paths = new Set([...before.keys(), ...after.keys()]);
  return [...paths].filter((p) => before.get(p) !== after.get(p)).sort();
}

export interface Sc010Context {
  /** The files as fetched (what the preview starts from before it re-applies the working copy). */
  fetched: VirtualFS;
  /** The keyboard id. */
  id: string;
}

/**
 * Asserts SC-010 for `paths`. A path the working copy no longer holds must be gone from
 * the download and the preview. Returns a failure list rather than throwing so a walk can
 * name the step; call `expectSc010` for the throwing form.
 */
export async function sc010Disagreements(ctx: Sc010Context, paths: readonly string[]): Promise<string[]> {
  const wc = useWorkingCopyStore.getState();
  const code = wc.startVfs!;
  const previewVfs = createVirtualFS(ctx.fetched.entries());
  const { result, unmount } = renderHook(() => useWorkingCopyTransform({ previewedStartId: ctx.id }));
  result.current!(previewVfs, ctx.id);
  unmount();
  const projected = await projectWorkingCopyForOutput();
  if (projected === null) return ["download: projection is null"];
  const bad: string[] = [];
  for (const path of paths) {
    if (isHistory(path)) continue;
    const c = readVfsText(code, path);
    const p = readVfsText(previewVfs, path);
    const d = readVfsText(projected.vfs, path);
    if (c === undefined) {
      if (p !== undefined) bad.push(`${path}: removed from the code view but the preview still holds it`);
      if (d !== undefined) bad.push(`${path}: removed from the code view but the download still holds it`);
      continue;
    }
    const n = (t: string | undefined): string | undefined => (t === undefined ? undefined : normaliseVersion(path, t));
    if (n(p) !== n(c)) bad.push(`${path}: preview differs from the code view`);
    if (n(d) !== n(c)) bad.push(`${path}: download differs from the code view`);
  }
  return bad;
}

export async function expectSc010(ctx: Sc010Context, paths: readonly string[], step: string): Promise<void> {
  const bad = await sc010Disagreements(ctx, paths);
  if (bad.length > 0) throw new Error(`SC-010 broken after "${step}":\n  ${bad.join("\n  ")}`);
}

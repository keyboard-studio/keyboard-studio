// replaceStartingPointAndReplay -- Open mode's "Apply" seam (spec 111 FR-009).
//
// The store action swaps the starting-point file (and, for a `.kmn`, `startIr`)
// in one update; this wrapper then replays the retained decisions over the new
// starting point so a later decision change builds on the author's edit rather
// than clobbering it. Synchronous; no timer.

import {
  useWorkingCopyStore,
  type ReplaceStartingPointResult,
} from "../stores/workingCopyStore.ts";

// The replay lives in decisions/rebuildWorkingCopy.ts, which reaches the editors
// through the survey registry. Importing it here would close a cycle, so it
// registers itself on load instead.
let replay: (() => unknown) | null = null;

export function registerStartingPointReplay(fn: () => unknown): void {
  replay = fn;
}

export function replaceStartingPointAndReplay(
  path: string,
  text: string,
): ReplaceStartingPointResult {
  const result = useWorkingCopyStore.getState().replaceStartingPointFromText(path, text);
  if (result.ok && path.endsWith(".kmn")) {
    if (replay === null) {
      console.warn("[replaceStartingPoint] no replay registered; the .kmn change was not replayed");
    } else {
      replay();
    }
  }
  return result;
}

/** The path of the opened keyboard's `.kmn` / `.kvks` / touch layout in the VFS. */
export function startingPointPath(
  keyboardId: string,
  ext: "kmn" | "kvks" | "keyman-touch-layout",
): string {
  return `source/${keyboardId}.${ext}`;
}

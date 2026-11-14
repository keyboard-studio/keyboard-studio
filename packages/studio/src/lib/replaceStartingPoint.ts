// replaceStartingPointAndReplay -- the earlier Adapt behaviour for a keyboard
// opened WITHOUT its package descriptor (an old draft; spec 111 FR-009).
//
// The store action swaps the starting-point file (and, for a `.kmn`, `startIr`)
// in one update; this wrapper then replays the retained decisions over the new
// starting point so a later decision change builds on the author's edit rather
// than clobbering it. On a keyboard opened with its descriptor nothing is
// replayed (FR-042): `recalculateForStartingPointChangeFromStores` returns
// first, and the code views go through `applyOpenChange` (kind `files`)
// instead. Synchronous; no timer.

import {
  useWorkingCopyStore,
  type ReplaceStartingPointResult,
} from "../stores/workingCopyStore.ts";
import { recalculateForStartingPointChangeFromStores } from "../decisions/rebuildWorkingCopy.ts";

/** Plain label of the undo step a code-view Apply records on Open (the footer Undo names it, see OpenUndoButton). */
export const CODE_VIEW_EDIT_LABEL = "Edit the keyboard source in the code view";

export function replaceStartingPointAndReplay(
  path: string,
  text: string,
): ReplaceStartingPointResult {
  const result = useWorkingCopyStore.getState().replaceStartingPointFromText(path, text);
  if (result.ok && path.endsWith(".kmn")) {
    recalculateForStartingPointChangeFromStores();
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

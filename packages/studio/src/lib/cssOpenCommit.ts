// cssOpenCommit -- the stylesheet step and the image-width fix on a keyboard
// opened for update (spec 111 FR-041, FR-045; constitution Article III). The
// caller-side half: the changes are built in `openApply/stylesheet.ts` and applied
// through the apply host (`useApplyOnOpen`), which owns the busy guard and the
// failure notices. Nothing is held in `customCss`. Copy never comes through here.
// No timers.

import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { isLiveOpen } from "./openMode.ts";
import { buildImageWidthChange, buildStylesheetChange } from "./openApply/stylesheet.ts";
import type { OpenApplyResult, OpenChange } from "./openApply/types.ts";

export { STYLESHEET_LABEL, DOC_IMAGE_WIDTH_LABEL, buildStylesheetChange } from "./openApply/stylesheet.ts";

export type StylesheetCommit =
  /** Not a keyboard open for update: the caller keeps its Copy behaviour. */
  | "off-open"
  /** The files now hold the text. */
  | "written"
  /** The files already held it; nothing was written. */
  | "unchanged"
  /** The store line cannot be placed in the `.kmn`; nothing was written and the caller says so. */
  | "no-store-line"
  /** The apply failed, was declined or was busy: the host already showed its notice. */
  | "not-applied";

type ApplyOnOpen = (change: OpenChange) => Promise<OpenApplyResult>;

function outcomeOf(result: OpenApplyResult): StylesheetCommit {
  if (result.status === "applied") return "written";
  if (result.status === "unchanged") return "unchanged";
  return "not-applied";
}

/** Apply the stylesheet editor's text to the opened keyboard's files. */
export async function commitStylesheetOnOpen(editorText: string, applyOnOpen: ApplyOnOpen): Promise<StylesheetCommit> {
  if (!isLiveOpen(useWorkingCopyStore.getState())) return "off-open";
  const built = buildStylesheetChange(editorText);
  if (built === null) return "not-applied";
  // A warning means the store line was not written: a stylesheet nothing names is not written either.
  if (built.warnings.length > 0) return "no-store-line";
  return outcomeOf(await applyOnOpen(built.change));
}

/** Write the accepted image-width fix into the pages' stylesheet(s) on Open. */
export async function commitImageWidthFixOnOpen(applyOnOpen: ApplyOnOpen): Promise<StylesheetCommit> {
  if (!isLiveOpen(useWorkingCopyStore.getState())) return "off-open";
  const change = buildImageWidthChange();
  if (change === null) return "not-applied";
  return outcomeOf(await applyOnOpen(change));
}

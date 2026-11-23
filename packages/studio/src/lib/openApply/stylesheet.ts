// Stylesheet writes on an opened keyboard (spec 111 FR-041): the OSK stylesheet
// and the pages' image-width fix, as precomputed `files` changes (one undo record
// each). This module only BUILDS the change; applying it is `lib/cssOpenCommit.ts`.

import { createVirtualFS } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { applyCustomCssToVfs } from "../customCss.ts";
import { KB_CSS, withImageWidthRule } from "../docImageWidthFix.ts";
import { readVfsText } from "../vfsText.ts";
import { diffFiles } from "./core.ts";
import type { OpenChange } from "./types.ts";

/** Plain label of the undo step a stylesheet apply records on Open. */
export const STYLESHEET_LABEL = "Stylesheet change";
/** Plain label of the undo step an accepted image-width fix records on Open. */
export const DOC_IMAGE_WIDTH_LABEL = "Add the image width rule";

/**
 * The change that writes `editorText` as the keyboard's stylesheet (empty text
 * removes the file and the store line), worked out with the projection step the
 * Copy output uses. `warnings` is what that step said: a non-empty list means the
 * store line could not be written, and the caller must not write the file alone.
 * Null when no keyboard is open.
 */
export function buildStylesheetChange(editorText: string): { change: OpenChange; warnings: string[] } | null {
  const { startVfs, startKeyboard } = useWorkingCopyStore.getState();
  if (startVfs === null || startKeyboard === null) return null;
  const clone = createVirtualFS(startVfs.entries());
  const warnings = applyCustomCssToVfs(clone, startKeyboard.id, editorText);
  return {
    change: { kind: "files", files: diffFiles(startVfs, clone), label: STYLESHEET_LABEL, labelKey: "stylesheet" },
    warnings,
  };
}

/**
 * The change that adds the width rule to the pages' stylesheets. A stylesheet the
 * loader carried outside the start files is created at its own path. Empty `files`
 * (nothing to add) is reported `unchanged` by the seam.
 */
export function buildImageWidthChange(): OpenChange | null {
  const { startVfs, startDocCssTexts } = useWorkingCopyStore.getState();
  if (startVfs === null) return null;
  const files: Record<string, string | null> = {};
  for (const path of startVfs.list("source/")) {
    if (!KB_CSS.test(path)) continue;
    const css = readVfsText(startVfs, path);
    const next = css === undefined ? null : withImageWidthRule(css);
    if (next !== null) files[path] = next;
  }
  for (const entry of startDocCssTexts ?? []) {
    if (!KB_CSS.test(entry.path) || startVfs.get(entry.path) !== undefined) continue;
    const next = withImageWidthRule(entry.text);
    if (next !== null) files[entry.path] = next;
  }
  return { kind: "files", files, label: DOC_IMAGE_WIDTH_LABEL, labelKey: "doc-image-width" };
}

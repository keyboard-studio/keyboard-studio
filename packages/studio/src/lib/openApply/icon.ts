// Icon writes on an opened keyboard (spec 111 FR-041, #2927): the edited
// `.ico` as a precomputed `files` change (one undo record). This module
// only BUILDS the change; applying it is `lib/iconOpenCommit.ts`.
//
// The change is worked out with the same helper the Copy projection step
// uses (`lib/iconWrite.ts`, run on a clone and diffed — the stylesheet
// builder's shape, `openApply/stylesheet.ts`): the `.ico` bytes at the
// `&BITMAP` file (or the canonical `source/<id>.ico` when nothing names
// one yet) plus the `&BITMAP` store line in the `.kmn` when it is missing
// or names another file. The diff is binary-aware (`diffFilesBinary`):
// the text-only `diffFiles` would drop the `.ico`.
//
// A keyboard with no icon file yet CREATES one here: unlike the docs
// precedent (a page with no file is not created on Open), an icon the
// author just drew has no file to refuse to — refusing would make the
// step a no-op on every icon-less keyboard.

import { createVirtualFS } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { applyIconToVfs } from "../iconWrite.ts";
import { diffFilesBinary } from "./core.ts";
import type { OpenChange } from "./types.ts";

/** Plain label of the undo step an icon apply records on Open. */
export const ICON_LABEL = "Keyboard icon";

/**
 * The change that writes the icon step's edited icon into the opened
 * keyboard's files. Null when no keyboard is open, when there is no edited
 * icon to write, or when the bytes cannot be decoded. An unchanged icon
 * (Keep passes the source bytes through) builds a change whose files the
 * seam reports `unchanged` — the caller treats that as written.
 */
export function buildIconChange(iconIcoBase64: string | null | undefined): { change: OpenChange } | null {
  const { startVfs, startKeyboard } = useWorkingCopyStore.getState();
  if (startVfs === null || startKeyboard === null) return null;
  if (iconIcoBase64 === null || iconIcoBase64 === undefined || iconIcoBase64 === "") return null;
  const clone = createVirtualFS(startVfs.entries());
  const written = applyIconToVfs(clone, startKeyboard.id, iconIcoBase64);
  if (written === null) return null;
  return {
    change: { kind: "files", files: diffFilesBinary(startVfs, clone), label: ICON_LABEL, labelKey: "icon" },
  };
}

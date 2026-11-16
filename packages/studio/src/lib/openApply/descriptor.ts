// Descriptor writes on an opened keyboard (spec 111 FR-041/FR-012): the
// author's language list goes into the keyboard's own `.kps` when it is applied,
// as a precomputed `files` change (one undo record). Only the `<Languages>`
// block can differ; every other byte of the descriptor is the file's own.
// This module only BUILDS the change; applying it is `lib/descriptorOpenCommit.ts`.

import { patchOpenKpsInfo, type OpenKpsInfoPatch } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { textOrNull } from "./core.ts";
import type { OpenChange } from "./types.ts";

/**
 * The `files` change that writes `patch` into the opened keyboard's `.kps`, or
 * null when there is no readable descriptor to write into. Built from the file
 * as it is now; an already-matching patch yields a change the seam reports
 * `unchanged`.
 */
export function buildDescriptorChange(patch: OpenKpsInfoPatch): OpenChange | null {
  const { startVfs, startKeyboard } = useWorkingCopyStore.getState();
  if (startVfs === null || startKeyboard === null) return null;
  const path = `source/${startKeyboard.id}.kps`;
  const current = textOrNull(startVfs, path);
  if (current === null) return null;
  const next = patchOpenKpsInfo(current, patch).text;
  return { kind: "files", files: { [path]: next }, label: "Language list", labelKey: "languages" };
}

// Utility: read a VFS entry's content as a string without an unsafe cast.
//
// Several call sites need "the text content at this path, or undefined if
// the entry is missing / binary" — this used to be hand-rolled as
// `vfs.get(path)?.content as string | undefined`, which silently lies if the
// entry turns out to hold a Uint8Array. Centralising the runtime `typeof`
// check here means every caller gets the same (correct) narrowing.

import type { VirtualFS } from "@keyboard-studio/contracts";

/**
 * Read the text content of `path` in `vfs`.
 * Returns `undefined` when the entry does not exist or its content is
 * binary (`Uint8Array`) rather than a string.
 */
export function readVfsText(vfs: VirtualFS, path: string): string | undefined {
  const content = vfs.get(path)?.content;
  return typeof content === "string" ? content : undefined;
}

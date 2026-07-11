// Utility: locate the primary .keyman-touch-layout file in a session VFS.
// Excludes the tests/ directory so test fixtures don't shadow the real source.
//
// Mirrors findKmnPath: the loader (fetchKeyboardSourceToVfs) writes the base's
// shipped touch layout to source/<id>.keyman-touch-layout when the .kmn names it
// via a LAYOUTFILE store, so the import path can carry it into the IR.

import type { VirtualFS } from "@keyboard-studio/contracts";

/**
 * Find the primary `.keyman-touch-layout` source file in `vfs`.
 * Returns `undefined` when no touch-layout file exists outside `tests/`.
 */
export function findTouchLayoutPath(vfs: VirtualFS): string | undefined {
  return vfs.list().find((p) => p.endsWith(".keyman-touch-layout") && !p.startsWith("tests/"));
}

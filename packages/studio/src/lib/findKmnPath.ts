// Utility: locate the primary .kmn file in a session VFS.
// Excludes the tests/ directory so test fixtures don't shadow the real source.

import type { VirtualFS } from "@keyboard-studio/contracts";

/**
 * Find the primary .kmn source file in `vfs`.
 * Returns `undefined` when no .kmn file exists outside `tests/`.
 */
export function findKmnPath(vfs: VirtualFS): string | undefined {
  return vfs.list().find((p) => p.endsWith(".kmn") && !p.startsWith("tests/"));
}

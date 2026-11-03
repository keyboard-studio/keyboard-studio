import { createVirtualFS, type VirtualFS } from "@keyboard-studio/contracts";

/**
 * Test helper: an in-memory VFS of text files, keyed by path. Replaces the
 * per-file `createVirtualFS([{ path, content, isBinary: false }, ...])` boilerplate.
 */
export function textVfs(files: Record<string, string>): VirtualFS {
  return createVirtualFS(
    Object.entries(files).map(([path, content]) => ({ path, content, isBinary: false })),
  );
}

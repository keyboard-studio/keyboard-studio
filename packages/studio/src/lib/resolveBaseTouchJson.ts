// resolveBaseTouchJson — shared helper for locating the base keyboard's
// shipped .keyman-touch-layout JSON from a VFS.
//
// Extracted from the inline blocks in TouchGallery.tsx and StudioShell.tsx so
// both call sites share one implementation and neither carries an unsafe
// `as string` cast or a redundant double-null check on baseVfs.

import type { VirtualFS } from "@keyboard-studio/contracts";
import { findTouchLayoutPath } from "./findTouchLayoutPath.js";

/**
 * Resolve the base keyboard's shipped `.keyman-touch-layout` JSON string from
 * a VFS.  Returns `undefined` when:
 *   - `vfs` is `null` (base not yet loaded), or
 *   - no `.keyman-touch-layout` file exists outside `tests/`, or
 *   - the file's content is binary (Uint8Array) rather than a string.
 *
 * The `undefined` return signals to callers that the Case A (generate from
 * scratch) path should run instead of the Case B (faithful edit) path.
 */
export function resolveBaseTouchJson(vfs: VirtualFS | null): string | undefined {
  if (vfs === null) return undefined;
  const p = findTouchLayoutPath(vfs);
  if (p === undefined) return undefined;
  const content = vfs.get(p)?.content;
  // Guard against binary/Uint8Array entries — only return string content.
  return typeof content === "string" ? content : undefined;
}

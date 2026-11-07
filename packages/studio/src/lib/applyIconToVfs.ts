// applyIconToVfs — the keyboard's icon as a working-copy value (#1550).
//
// `applyIconToVfs` is the projection step that makes the author's icon
// reach the output (projectWorkingCopyVfs, applied after the id-rename
// pass). The bytes pass through UNRE-ENCODED: the store holds the base64
// of the `.ico` the editor encoded (or the template's bytes, on Keep),
// and this step writes those exact bytes to `source/<keyboardId>.ico` as
// a flagged binary VFS entry and ensures the `.kmn` header carries
// `store(&BITMAP) '<id>.ico'` — via the engine's `setKeyboardIconBytes`,
// which owns the VFS + header write.

import type { VirtualFS } from "@keyboard-studio/contracts";
import { setKeyboardIconBytes } from "@keyboard-studio/engine";
import { readVfsText } from "./vfsText.ts";

/** Base64 to bytes. `atob` is available in browsers and in Node 16+. */
export function base64ToBytes(base64: string): Uint8Array {
  const s = atob(base64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/**
 * Write the author's icon into the projected VFS. `iconIcoBase64 === null`
 * means "untouched" and changes nothing (the start keyboard's own icon, if
 * any, ships as-is). Returns warnings for the projection's channel.
 */
export function applyIconToVfs(
  vfs: VirtualFS,
  keyboardId: string,
  iconIcoBase64: string | null,
): string[] {
  if (iconIcoBase64 === null) return [];
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(iconIcoBase64);
  } catch {
    return [
      "[project-working-copy] the recorded icon could not be decoded (corrupt base64), so no .ico was written",
    ];
  }
  if (bytes.length === 0) {
    return ["[project-working-copy] the recorded icon is empty, so no .ico was written"];
  }
  const kmnPath = `source/${keyboardId}.kmn`;
  if (readVfsText(vfs, kmnPath) === undefined) {
    // No .kmn to hang the store on — an unreferenced .ico would ship as
    // dead weight, so write nothing and say so.
    return [
      `[project-working-copy] the recorded icon was not written: ${kmnPath} is missing, so no &BITMAP store could be added`,
    ];
  }
  setKeyboardIconBytes(vfs, kmnPath, keyboardId, bytes);
  return [];
}

// Keyboard icon VFS management (#1550).
//
// Writes an encoded .ico to `source/<keyboardId>.ico` as a binary VFS entry
// and ensures the .kmn header carries `store(&BITMAP) '<id>.ico'` while an
// icon is set. Removing the icon deletes the VFS entry and drops the store
// line (the compile-time `dropUnbackedBitmapStore` guard then has nothing
// to strip).

import type { VirtualFS } from "@keyboard-studio/contracts";
import { encodeIconSet, type RgbaImage } from "./icoEncoder.js";

const BITMAP_STORE_RE = /^[ \t]*store\s*\(\s*&BITMAP\s*\)\s*'[^']*'\s*$/gim;

/**
 * Set the keyboard's icon from RGBA pixel data.
 *
 * Encodes a multi-size .ico (16/32/48px), writes it to
 * `source/<keyboardId>.ico` as a binary VFS entry, and ensures the .kmn
 * header contains `store(&BITMAP) '<keyboardId>.ico'`.
 *
 * @param vfs The working-copy VFS (mutated in place).
 * @param kmnPath Path of the .kmn source file in the VFS (e.g. `source/<id>.kmn`).
 * @param keyboardId The keyboard id (file stem for the .ico).
 * @param image Source RGBA image (any square size; resampled to 16/32/48).
 * @returns The updated .kmn text.
 */
export function setKeyboardIcon(
  vfs: VirtualFS,
  kmnPath: string,
  keyboardId: string,
  image: RgbaImage,
): string {
  const icoBytes = encodeIconSet(image);
  const icoPath = `source/${keyboardId}.ico`;
  vfs.set(icoPath, icoBytes, true);

  const entry = vfs.get(kmnPath);
  if (entry === undefined) {
    throw new Error(`setKeyboardIcon: ${kmnPath} not found in VFS`);
  }
  const kmn = typeof entry.content === "string" ? entry.content : new TextDecoder().decode(entry.content);
  const updated = ensureBitmapStore(kmn, `${keyboardId}.ico`);
  vfs.set(kmnPath, updated);
  return updated;
}

/**
 * Remove the keyboard's icon: deletes the .ico VFS entry (if present) and
 * drops the `store(&BITMAP)` line from the .kmn header.
 *
 * @returns The updated .kmn text.
 */
export function removeKeyboardIcon(vfs: VirtualFS, kmnPath: string, keyboardId: string): string {
  vfs.delete(`source/${keyboardId}.ico`);

  const entry = vfs.get(kmnPath);
  if (entry === undefined) {
    throw new Error(`removeKeyboardIcon: ${kmnPath} not found in VFS`);
  }
  const kmn = typeof entry.content === "string" ? entry.content : new TextDecoder().decode(entry.content);
  const updated = kmn.replace(BITMAP_STORE_RE, "").replace(/\n{3,}/g, "\n\n");
  vfs.set(kmnPath, updated);
  return updated;
}

/**
 * Ensure the .kmn header contains `store(&BITMAP) '<file>'`. If a BITMAP
 * store line already exists, its path is rewritten; otherwise the line is
 * inserted after the last existing `store(...)` line in the header
 * (before `begin`), or at the top of the header if there are none.
 */
export function ensureBitmapStore(kmn: string, file: string): string {
  const line = `store(&BITMAP) '${file}'`;
  if (BITMAP_STORE_RE.test(kmn)) {
    BITMAP_STORE_RE.lastIndex = 0;
    return kmn.replace(BITMAP_STORE_RE, line);
  }
  BITMAP_STORE_RE.lastIndex = 0;

  const lines = kmn.split("\n");
  const beginIdx = lines.findIndex((l) => /^\s*begin\s+/i.test(l) || /^\s*begin\s*$/i.test(l));
  const headerEnd = beginIdx === -1 ? lines.length : beginIdx;

  let insertAt = -1;
  for (let i = headerEnd - 1; i >= 0; i--) {
    if (/^[ \t]*store\s*\(/i.test(lines[i]!)) {
      insertAt = i + 1;
      break;
    }
  }
  if (insertAt === -1) {
    // No store lines: insert after the header's first non-comment line
    // (typically `c` keyboard metadata), else at the very top.
    insertAt = 0;
    for (let i = 0; i < headerEnd; i++) {
      if (lines[i]!.trim() !== "" && !/^[ \t]*c\b/i.test(lines[i]!)) {
        insertAt = i;
        break;
      }
    }
  }
  lines.splice(insertAt, 0, line);
  return lines.join("\n");
}

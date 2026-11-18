// iconWrite -- write an edited keyboard icon into a VFS (#2927).
//
// The one place that knows where an icon lives: the file the `.kmn`'s
// `store(&BITMAP)` names, else the single `.ico` the VFS already holds,
// else the canonical `source/<keyboardId>.ico`. Both tracks use it — the
// Copy projection step (projectWorkingCopyVfs step 4c) writes the working
// copy through it, and the Open builder (openApply/icon) runs it on a clone
// and diffs, so the two tracks can never disagree about the filename or
// the store line.
//
// The `.kps` needs nothing: the package descriptor never lists the `.ico`
// (criterion 8.10b forbids listing uncompiled sources); the icon ships
// via `&BITMAP` in the `.kmn` only.

import type { VirtualFS } from "@keyboard-studio/contracts";
import { ensureBitmapStore, parseKmnHeaderStores } from "@keyboard-studio/engine";
import { base64ToIco } from "../editors/assignLoop/icoCodec.ts";
import { readVfsText } from "./vfsText.ts";

export interface IconWriteResult {
  /** The VFS path the icon bytes were written to. */
  iconPath: string;
  /** True when the `.kmn` had no `&BITMAP` line and one was added. */
  bitmapAdded: boolean;
}

/** The icon file a `.kmn`'s `&BITMAP` store names, as a `source/` path, or null. */
export function bitmapIconPath(kmnText: string): string | null {
  const found = parseKmnHeaderStores(kmnText).find((s) => s.storeName === "BITMAP");
  if (found === undefined) return null;
  const name = found.path;
  return name.includes("/") ? name : `source/${name}`;
}

/** The `.ico` files a VFS holds under `source/`. */
export function existingIconPaths(vfs: VirtualFS): string[] {
  return vfs
    .list("source/")
    .filter((p) => p.toLowerCase().endsWith(".ico"));
}

/**
 * Resolve the path an edited icon is written to: the `&BITMAP` file first
 * (the name the output already carries), else the single `.ico` the VFS
 * holds (a base that names its icon `Cameroon.ico` keeps that name),
 * else the canonical `source/<keyboardId>.ico`. A keyboard with several
 * `.ico` files and no `&BITMAP` line also takes the canonical name — the
 * edited icon is the one `&BITMAP` will name.
 */
export function resolveIconPath(vfs: VirtualFS, kmnText: string | undefined, keyboardId: string): string {
  const fromBitmap = kmnText === undefined ? null : bitmapIconPath(kmnText);
  if (fromBitmap !== null) return fromBitmap;
  const existing = existingIconPaths(vfs);
  if (existing.length === 1) return existing[0]!;
  return `source/${keyboardId}.ico`;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

/**
 * Write the icon step's edited icon into `vfs` (mutated in place).
 *
 * Decodes `iconIcoBase64` and stores the bytes at the resolved icon path
 * (binary entry), then ensures the `.kmn` carries `store(&BITMAP)` naming
 * that file. Returns null when there is nothing to write
 * (`iconIcoBase64` null/undefined/empty) or when the bytes cannot be
 * decoded (the caller reports that as a warning, never a throw).
 *
 * Idempotent: Keep passes the source bytes through, so writing the same
 * bytes over the file they came from changes nothing — except adding a
 * missing `&BITMAP` line, which is the fix for a keyboard whose icon file
 * nothing named.
 */
export function applyIconToVfs(
  vfs: VirtualFS,
  keyboardId: string,
  iconIcoBase64: string | null | undefined,
): IconWriteResult | null {
  if (iconIcoBase64 === null || iconIcoBase64 === undefined || iconIcoBase64 === "") return null;
  let bytes: Uint8Array;
  try {
    bytes = base64ToIco(iconIcoBase64);
  } catch {
    return null;
  }
  const kmnPath = `source/${keyboardId}.kmn`;
  const kmnText = readVfsText(vfs, kmnPath);
  const iconPath = resolveIconPath(vfs, kmnText, keyboardId);
  const current = vfs.get(iconPath)?.content;
  if (!(current instanceof Uint8Array && bytesEqual(current, bytes))) {
    vfs.set(iconPath, bytes, true);
  }
  if (kmnText === undefined) return { iconPath, bitmapAdded: false };
  // The `.kmn` already names this file: leave its text alone. Rewriting
  // the line to the same value would still touch the file (and, before
  // the CRLF fix, strip one line ending) for no change.
  if (bitmapIconPath(kmnText) === iconPath) return { iconPath, bitmapAdded: false };
  const hadBitmap = bitmapIconPath(kmnText) !== null;
  const nextKmn = ensureBitmapStore(kmnText, iconPath.replace(/^source\//, ""));
  if (nextKmn !== kmnText) vfs.set(kmnPath, nextKmn, false);
  return { iconPath, bitmapAdded: !hadBitmap };
}

// customCss — the keyboard's own OSK stylesheet (`&KMW_EMBEDCSS`) as a working-copy value.
//
// `readKeyboardCss` is what the CSS step seeds its editor from; `applyCustomCssToVfs` is the projection step that makes the author's
// text reach the OSK preview and the zip alike (projectWorkingCopyVfs step 0b). Both work on the VFS text, not the IR: the store is a
// header line the codec keeps as-is, and the sibling file is not an IR concern.

import type { VirtualFS } from "@keyboard-studio/contracts";
import { parseKmnHeaderStores, rewriteKmwKeyboardSelectors } from "@keyboard-studio/engine";
import { readVfsText } from "./vfsText.ts";
import { isOskStylesheetPath } from "./oskStylesheetPath.ts";

export interface KeyboardCss {
  /** VFS path of the stylesheet. */
  path: string;
  text: string;
}

const EMBEDCSS_STORE_LINE = /^[ \t]*store\(\s*&KMW_EMBEDCSS\s*\)[^\r\n]*(?:\r?\n|$)/im;

/** The VFS path the `.kmn` names through `&KMW_EMBEDCSS`, whether or not the file exists. */
function declaredCssPath(vfs: VirtualFS, keyboardId: string): string | undefined {
  const kmn = readVfsText(vfs, `source/${keyboardId}.kmn`);
  if (kmn === undefined) return undefined;
  const store = parseKmnHeaderStores(kmn).find((s) => s.storeName === "KMW_EMBEDCSS");
  return store === undefined ? undefined : `source/${store.path.replace(/\\/g, "/")}`;
}

/**
 * The keyboard's OSK stylesheet: the file `&KMW_EMBEDCSS` names, else the first OSK-applicable `.css` under `source/` (the
 * welcome/help pages' `kb.css` never styles the keyboard). Null when the keyboard has none.
 */
export function readKeyboardCss(vfs: VirtualFS, keyboardId: string): KeyboardCss | null {
  const declared = declaredCssPath(vfs, keyboardId);
  if (declared !== undefined) {
    const text = readVfsText(vfs, declared);
    if (text !== undefined) return { path: declared, text };
  }
  for (const path of vfs.list("source/")) {
    if (!path.toLowerCase().endsWith(".css") || !isOskStylesheetPath(path)) continue;
    const text = readVfsText(vfs, path);
    if (text !== undefined) return { path, text };
  }
  return null;
}

/**
 * Write the author's CSS into the projected VFS. `css === null` means "untouched" and changes nothing; "" means the author cleared
 * it, which removes the file and the `&KMW_EMBEDCSS` line (a store naming a missing file makes the KeymanWeb compile throw).
 * The stored text names the keyboard by its start id, as the start files do, so a later id change still relinks it; its
 * `.kmw-keyboard-<startKeyboardId>` selectors become `keyboardId`'s on the way in. Returns warnings for the projection's channel.
 */
export function applyCustomCssToVfs(
  vfs: VirtualFS,
  keyboardId: string,
  storedCss: string | null,
  startKeyboardId: string = keyboardId,
): string[] {
  if (storedCss === null) return [];
  const css = rewriteKmwKeyboardSelectors(storedCss, startKeyboardId, keyboardId);
  const kmnPath = `source/${keyboardId}.kmn`;
  const kmn = readVfsText(vfs, kmnPath);
  const existing = readKeyboardCss(vfs, keyboardId);
  const path = existing?.path ?? `source/${keyboardId}.css`;

  if (css.trim() === "") {
    if (existing !== null) vfs.delete(existing.path);
    if (kmn !== undefined && EMBEDCSS_STORE_LINE.test(kmn)) {
      vfs.set(kmnPath, kmn.replace(EMBEDCSS_STORE_LINE, ""), false);
    }
    return [];
  }

  vfs.set(path, css, false);
  if (kmn === undefined) {
    return [`[project-working-copy] custom CSS written to ${path} but ${kmnPath} is missing, so no &KMW_EMBEDCSS store was added`];
  }
  if (EMBEDCSS_STORE_LINE.test(kmn)) return [];

  // Header stores must precede `begin`; the path is relative to source/.
  const line = `store(&KMW_EMBEDCSS) '${path.slice("source/".length)}'`;
  const eol = kmn.includes("\r\n") ? "\r\n" : "\n";
  const beginAt = kmn.search(/^[ \t]*begin\b/im);
  if (beginAt === -1) {
    return [`[project-working-copy] custom CSS written to ${path} but ${kmnPath} has no begin statement, so no &KMW_EMBEDCSS store was added`];
  }
  vfs.set(kmnPath, `${kmn.slice(0, beginAt)}${line}${eol}${eol}${kmn.slice(beginAt)}`, false);
  return [];
}

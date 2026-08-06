// Strip dangling packaging-asset store references from a .kmn for PREVIEW compiles.
//
// kmcmplib refuses to emit ANY artifacts when a header store names a packaging
// asset file (BITMAP icon, VISUALKEYBOARD .kvks, LAYOUTFILE touch layout, etc.)
// that it cannot open — it reports "Cannot open the bitmap or icon file for
// reading" as a *warning* but produces zero artifacts. A live OSK preview does
// not need any of these packaging assets, so a missing one must not break the
// preview.
//
// Two categories of stores are stripped:
//
// 1. DANGLING_STORES — stripped only when their target file is absent from the
//    compile VFS. References whose file IS present are left intact (e.g. a
//    fully-fetched base keeps its .kvks visual keyboard in the preview).
//
// 2. ALWAYS_STRIP_STORES — stripped unconditionally regardless of VFS presence.
//    These are help-panel assets (KMW_HELPFILE, KMW_EMBEDJS) that cause KMW to
//    render its help documentation instead of the keyboard layout OSK. The live
//    preview never needs help-panel content, so always strip them even when the
//    file was fetched into VFS.
//
// The full output/zip path does NOT use this — it serializes the unmodified IR.
// {@link dropUnbackedBitmapStore} below is the one asset-store removal that DOES
// apply to the shipped .kmn; see its docstring for why the icon is the exception.

import type { VirtualFS } from "@keyboard-studio/contracts";
import { parseKmnHeaderStores } from "./parseKmnHeaderStores.js";
import {
  danglingPreviewStripStores,
  alwaysPreviewStripStores,
} from "../shared/siblingAssetStores.js";

// Packaging-asset stores stripped only when their file is absent from VFS.
const DANGLING_STORES = danglingPreviewStripStores();

// Help-panel stores stripped unconditionally for preview compiles — their
// presence causes KMW to render the help documentation panel instead of the
// keyboard layout OSK, which is never useful in the live preview.
const ALWAYS_STRIP_STORES = alwaysPreviewStripStores();

/**
 * Remove header `store(&ASSET) 'path'` lines that would interfere with the
 * live OSK preview. Returns `{ kmn, stripped }` where `stripped` lists the
 * store names removed (for diagnostics). When nothing is stripped, returns
 * the input text unchanged.
 *
 * - DANGLING_STORES (BITMAP, VISUALKEYBOARD, LAYOUTFILE, DISPLAYMAP) are
 *   removed only when their target file is absent from `vfs` (`source/<path>`).
 * - ALWAYS_STRIP_STORES (KMW_HELPFILE, KMW_EMBEDJS) are always removed —
 *   they cause KMW to render help documentation instead of the keyboard layout.
 *
 * @param kmn   The .kmn source text to filter.
 * @param vfs   The compile VFS — checked for `source/<path>` presence.
 */
export function stripDanglingAssetStores(
  kmn: string,
  vfs: VirtualFS,
): { kmn: string; stripped: string[] } {
  const stores = parseKmnHeaderStores(kmn);
  const toStrip = stores.filter(
    (s) =>
      ALWAYS_STRIP_STORES.has(s.storeName) ||
      (DANGLING_STORES.has(s.storeName) && vfs.get(`source/${s.path}`) === undefined),
  );
  if (toStrip.length === 0) return { kmn, stripped: [] };

  return removeHeaderStoreLines(kmn, new Set(toStrip.map((s) => s.storeName)));
}

/**
 * Remove the named `store(&NAME) 'path'` lines from a .kmn header.
 *
 * Only the header (text before `begin`) is touched — a `store(&X)` after `begin`
 * would be unusual, and this mirrors {@link parseKmnHeaderStores}, which also
 * scans the header only. Returns `{ kmn, stripped }`, `stripped` listing the
 * store names actually removed.
 */
function removeHeaderStoreLines(
  kmn: string,
  names: ReadonlySet<string>,
): { kmn: string; stripped: string[] } {
  const stripped: string[] = [];

  const beginMatch = /^\s*begin\s/im.exec(kmn);
  const headerEnd = beginMatch !== null ? beginMatch.index : kmn.length;

  const storeLineRe = /^[ \t]*store\s*\(\s*&([A-Z_][A-Z0-9_]*)\s*\)\s*(?:'[^']*'|"[^"]*")[^\n]*\n?/gim;
  const header = kmn.slice(0, headerEnd);
  const rest = kmn.slice(headerEnd);

  const newHeader = header.replace(storeLineRe, (line, name: string) => {
    if (names.has((name ?? "").toUpperCase())) {
      stripped.push((name ?? "").toUpperCase());
      return "";
    }
    return line;
  });

  return { kmn: newHeader + rest, stripped };
}

/**
 * Drop `store(&BITMAP) '<file>'` when `<file>` is not in the VFS.
 *
 * Unlike {@link stripDanglingAssetStores}, this applies to the SHIPPED .kmn, not
 * just the preview: an icon reference with no icon behind it is not a degraded
 * package, it is a package that does not build. kmcmplib reports "Cannot open the
 * bitmap or icon file for reading" as a mere *warning* and then emits ZERO
 * artifacts, so the reference has to go rather than be left for the author (or
 * the keyboards-repo CI) to discover as an empty build.
 *
 * The icon is the right store to treat this way because it is the one purely
 * cosmetic packaging asset: a keyboard with no icon is a complete, working
 * keyboard. The other dangling-asset stores are load-bearing — VISUALKEYBOARD
 * and LAYOUTFILE name the keyboard's own layouts — so a missing one is a fetch
 * bug to surface, not a line to quietly delete from the author's source.
 *
 * @param kmn The .kmn source text destined for the output tree.
 * @param vfs The VFS the .kmn lives in (icon looked up at `source/<path>`).
 * @returns `{ kmn, dropped }` — `dropped` is the icon path removed, or null when
 *          there was no &BITMAP or its file was present.
 */
export function dropUnbackedBitmapStore(
  kmn: string,
  vfs: VirtualFS,
): { kmn: string; dropped: string | null } {
  const bitmap = parseKmnHeaderStores(kmn).find((s) => s.storeName === "BITMAP");
  if (bitmap === undefined) return { kmn, dropped: null };
  if (vfs.get(`source/${bitmap.path}`) !== undefined) return { kmn, dropped: null };

  const { kmn: out, stripped } = removeHeaderStoreLines(kmn, new Set(["BITMAP"]));
  return { kmn: out, dropped: stripped.length > 0 ? bitmap.path : null };
}

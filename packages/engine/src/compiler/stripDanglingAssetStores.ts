// Strip dangling packaging-asset store references from a .kmn for PREVIEW compiles.
//
// kmcmplib refuses to emit ANY artifacts when a header store names a packaging
// asset file (BITMAP icon, VISUALKEYBOARD .kvks, LAYOUTFILE touch layout, etc.)
// that it cannot open — it reports "Cannot open the bitmap or icon file for
// reading" as a *warning* but produces zero artifacts. A live OSK preview does
// not need any of these packaging assets, so a missing one must not break the
// preview.
//
// This helper removes ONLY references whose target file is absent from the
// compile VFS ("dangling"). References whose file IS present are left intact, so
// a fully-fetched base keeps its visual keyboard / touch layout in the preview.
// The full output/zip path does NOT use this — it serializes the unmodified IR.

import type { VirtualFS } from "@keyboard-studio/contracts";
import { parseKmnHeaderStores } from "./parseKmnHeaderStores.js";

// Packaging-asset system stores that name a sibling file kmcmplib opens at
// compile time. A dangling reference to any of these zeroes the artifact set.
const ASSET_STORES = new Set([
  "BITMAP",
  "VISUALKEYBOARD",
  "LAYOUTFILE",
  "KMW_EMBEDJS",
  "KMW_HELPFILE",
  "DISPLAYMAP",
]);

/**
 * Remove header `store(&ASSET) 'path'` lines whose referenced file is NOT
 * present in `vfs` (under `source/<path>`). Returns `{ kmn, stripped }` where
 * `stripped` lists the store names removed (for diagnostics). When nothing is
 * dangling, returns the input text unchanged.
 *
 * @param kmn   The .kmn source text to filter.
 * @param vfs   The compile VFS — checked for `source/<path>` presence.
 */
export function stripDanglingAssetStores(
  kmn: string,
  vfs: VirtualFS,
): { kmn: string; stripped: string[] } {
  const stores = parseKmnHeaderStores(kmn);
  const dangling = stores.filter(
    (s) => ASSET_STORES.has(s.storeName) && vfs.get(`source/${s.path}`) === undefined,
  );
  if (dangling.length === 0) return { kmn, stripped: [] };

  const danglingNames = new Set(dangling.map((s) => s.storeName));
  const stripped: string[] = [];

  // Remove the matching store lines. Only touch the header (before `begin`);
  // a store(&X) after begin would be unusual, and we mirror parseKmnHeaderStores
  // which only scans the header.
  const beginMatch = /^\s*begin\s/im.exec(kmn);
  const headerEnd = beginMatch !== null ? beginMatch.index : kmn.length;

  const storeLineRe = /^[ \t]*store\s*\(\s*&([A-Z_][A-Z0-9_]*)\s*\)\s*(?:'[^']*'|"[^"]*")[^\n]*\n?/gim;
  const header = kmn.slice(0, headerEnd);
  const rest = kmn.slice(headerEnd);

  const newHeader = header.replace(storeLineRe, (line, name: string) => {
    if (danglingNames.has((name ?? "").toUpperCase())) {
      stripped.push((name ?? "").toUpperCase());
      return "";
    }
    return line;
  });

  return { kmn: newHeader + rest, stripped };
}

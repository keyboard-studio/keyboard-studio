// Reconcile sibling asset-path header stores in a re-emitted .kmn with the
// files ACTUALLY present in the VFS.
//
// Why this exists: the working-copy carve projection re-emits the .kmn from
// the session's base IR. On the Track 1 (copy) path, scaffold() has already
// renamed every sibling file (source/<baseId>.kvks → source/<newId>.kvks) and
// rewritten the header stores to match — but the base IR captured at keyboard
// SELECTION still carries the base-id filenames. A carve re-emit therefore
// stamps stale references (e.g. `store(&VISUALKEYBOARD) '<baseId>.kvks'`)
// over the scaffolded .kmn. stripDanglingAssetStores then removes those
// now-dangling references before the preview compile, and the compiled
// keyboard silently loses its visual keyboard / touch layout — the OSK falls
// back to the underlying default layout.
//
// This helper repairs exactly that mismatch, conservatively: a store is
// rewritten ONLY when its referenced file is absent from the VFS AND the
// keyboardId-named sibling with the same extension exists. Valid references
// and non-sibling paths pass through untouched, so the un-renamed (Track 2 /
// adapt) case is a no-op.

import type { VirtualFS } from "@keyboard-studio/contracts";
import { parseKmnHeaderStores } from "./parseKmnHeaderStores.js";
import { reconcileRepairStores } from "../shared/siblingAssetStores.js";

// Header stores that carry sibling-file paths (kmcmplib's kmw-compiler store
// sweep, same set rewriteSiblingPathStores + stripDanglingAssetStores cover).
// INCLUDECODES is excluded — it names a shared constants file, not a
// per-keyboard-id sibling filename.
const SIBLING_PATH_STORES = reconcileRepairStores();

/**
 * Rewrite sibling asset-path header stores whose referenced file is missing
 * from `vfs` to the `<keyboardId><ext>` sibling when that file exists.
 *
 * @param kmn        The re-emitted .kmn source text.
 * @param vfs        The VFS the .kmn will live in (paths under `source/`).
 * @param keyboardId The id whose sibling files the VFS holds.
 * @returns `{ kmn, rewrites }` — the (possibly) updated text plus the list of
 *          store names rewritten (empty when nothing needed repair).
 */
export function reconcileSiblingAssetPaths(
  kmn: string,
  vfs: VirtualFS,
  keyboardId: string,
): { kmn: string; rewrites: string[] } {
  const rewrites: string[] = [];
  let out = kmn;

  for (const store of parseKmnHeaderStores(kmn)) {
    if (!SIBLING_PATH_STORES.has(store.storeName)) continue;
    const path = store.path?.trim();
    if (!path) continue;
    // Reference already valid — leave it alone.
    if (vfs.get(`source/${path}`) !== undefined) continue;
    // Only bare sibling filenames are candidates (mirror rewriteSiblingPathStores).
    if (/[\\/]/.test(path)) continue;
    const dotIdx = path.indexOf(".");
    if (dotIdx < 0) continue;
    const candidate = `${keyboardId}${path.slice(dotIdx)}`;
    if (candidate === path || vfs.get(`source/${candidate}`) === undefined) continue;

    const lineRe = new RegExp(
      `(store\\s*\\(\\s*&${store.storeName}\\s*\\)\\s*)(['"])[^'"\\n]*\\2`,
      "i",
    );
    const rewritten = out.replace(lineRe, `$1$2${candidate}$2`);
    if (rewritten !== out) {
      out = rewritten;
      rewrites.push(store.storeName);
    }
  }

  return { kmn: out, rewrites };
}

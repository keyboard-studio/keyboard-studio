/**
 * siblingAssetStores — the canonical table of .kmn header system-store names
 * that name sibling asset files (VISUALKEYBOARD, LAYOUTFILE, BITMAP, etc.).
 *
 * Four call sites each need a DIFFERENT subset/attribute of this same list —
 * before this module they were four independently hand-maintained literals
 * that could silently drift apart:
 *
 *   - {@link parseKmnHeaderStores} (compiler)  — which stores kmcmplib needs
 *     fetched, and whether a missing file is a hard compile error.
 *   - {@link resetIdentity}'s rewriteSiblingPathStores (scaffolder) — which
 *     stores get their sibling filename rewritten on a scaffold rename.
 *   - {@link stripDanglingAssetStores} (compiler)  — which stores are removed
 *     from a PREVIEW-only compile, and whether that removal is unconditional
 *     or only when the file is actually missing from the VFS.
 *   - {@link reconcileSiblingAssetPaths} (compiler) — which stores get a
 *     stale sibling reference repaired to the renamed keyboardId file.
 *
 * This table declares each store's per-purpose attributes ONCE; the four call
 * sites derive their subset from it instead of repeating the list. Per-store
 * RATIONALE lives here; per-call-site "why this subset" comments stay at each
 * call site.
 */

/** How a store's sibling filename is rewritten on a scaffold identity rename. */
export type ScaffoldRenameMode =
  /** Rewritten unconditionally whenever the store is present. */
  | "always"
  /** Only rewritten when the current basename already equals the base keyboardId (BITMAP's `renameFilesInVfs` parity rule). */
  | "bitmap-conditional"
  /** Never rewritten by the scaffolder. */
  | "never";

/** How a store is stripped from a PREVIEW-only compile. */
export type PreviewStripMode =
  /** Stripped only when its target file is absent from the compile VFS. */
  | "dangling"
  /** Stripped unconditionally (help-panel assets that would hijack the OSK preview). */
  | "always"
  /** Never stripped for preview. */
  | "never";

export interface SiblingAssetStoreEntry {
  /** Store name without the leading '&' (e.g. "VISUALKEYBOARD"). */
  name: string;
  /** kmcmplib will hard-fail the compile if this store is named but its file is missing. */
  fetchRequired: boolean;
  /** Scaffold-rename behavior (rewriteSiblingPathStores). */
  scaffoldRename: ScaffoldRenameMode;
  /** Preview-strip behavior (stripDanglingAssetStores). */
  previewStrip: PreviewStripMode;
  /** Whether reconcileSiblingAssetPaths repairs a stale reference to this store. */
  reconcileRepair: boolean;
  /**
   * The `source/<baseId><extension>` sibling-file extension `renameFilesInVfs`
   * (scaffolder) renames on a scaffold identity rename, if this store's file
   * has a conventional on-disk extension. Omitted for INCLUDECODES (a shared
   * constants file, not a per-keyboard sibling) and DISPLAYMAP (a PUA-font
   * sidecar not covered by `renameFilesInVfs`).
   */
  extension?: string;
}

/**
 * The eight sibling-asset store names, in kmcmplib's kmw-compiler store-sweep
 * order. Rationale per store (see also parseKmnHeaderStores.ts's original
 * discovery notes, km-keyman #39 cycle 3):
 *
 *   - LAYOUTFILE / VISUALKEYBOARD / KMW_EMBEDJS / INCLUDECODES: fetchRequired
 *     — kmcmplib hard-fails the compile when named but unreadable.
 *   - BITMAP / KMW_EMBEDCSS / KMW_HELPFILE / DISPLAYMAP: not fetchRequired —
 *     kmcmplib degrades (warning, or a silently dropped preview feature)
 *     rather than hard-failing.
 *   - BITMAP's scaffold rename is conditional: `renameFilesInVfs` only
 *     renames the icon when its filename already equals the base keyboardId,
 *     so the store rewrite mirrors that same condition.
 *   - INCLUDECODES / DISPLAYMAP are never scaffold-renamed: INCLUDECODES
 *     names a shared Unicode-constants file, not a per-keyboard sibling;
 *     DISPLAYMAP is a PUA-font sidecar not covered by `renameFilesInVfs`.
 *   - INCLUDECODES is never stripped for preview (the keyboard's rules
 *     reference its constants — stripping would break compilation, not just
 *     degrade the OSK) and is excluded from reconcile repair for the same
 *     reason: its path is not a per-keyboard-id sibling filename.
 *   - KMW_EMBEDCSS is never preview-stripped: dropping it silently loses OSK
 *     styling rather than fixing a hard failure, so preview keeps it and
 *     tolerates a missing sibling however `resolveOskAssetPaths` decides to.
 *   - KMW_HELPFILE / KMW_EMBEDJS are always preview-stripped: their presence
 *     makes KMW render its help-panel instead of the keyboard layout OSK,
 *     which is never useful in the live preview, fetched or not.
 */
export const SIBLING_ASSET_STORES: readonly SiblingAssetStoreEntry[] = [
  { name: "LAYOUTFILE", fetchRequired: true, scaffoldRename: "always", previewStrip: "dangling", reconcileRepair: true, extension: ".keyman-touch-layout" },
  { name: "VISUALKEYBOARD", fetchRequired: true, scaffoldRename: "always", previewStrip: "dangling", reconcileRepair: true, extension: ".kvks" },
  { name: "BITMAP", fetchRequired: false, scaffoldRename: "bitmap-conditional", previewStrip: "dangling", reconcileRepair: true, extension: ".ico" },
  { name: "KMW_EMBEDJS", fetchRequired: true, scaffoldRename: "always", previewStrip: "always", reconcileRepair: true, extension: ".js" },
  { name: "KMW_EMBEDCSS", fetchRequired: false, scaffoldRename: "always", previewStrip: "never", reconcileRepair: true, extension: ".css" },
  { name: "KMW_HELPFILE", fetchRequired: false, scaffoldRename: "always", previewStrip: "always", reconcileRepair: true, extension: ".htm" },
  { name: "DISPLAYMAP", fetchRequired: false, scaffoldRename: "never", previewStrip: "dangling", reconcileRepair: true },
  { name: "INCLUDECODES", fetchRequired: true, scaffoldRename: "never", previewStrip: "never", reconcileRepair: false },
];

/** `{ storeName: fetchRequired }` — parseKmnHeaderStores' SYSTEM_STORES shape. */
export function fetchRequiredMap(): Record<string, boolean> {
  return Object.fromEntries(SIBLING_ASSET_STORES.map((s) => [s.name, s.fetchRequired]));
}

/** Store names rewritten unconditionally on a scaffold identity rename. */
export function unconditionalScaffoldRenameStores(): string[] {
  return SIBLING_ASSET_STORES.filter((s) => s.scaffoldRename === "always").map((s) => s.name);
}

/** The single store name with conditional (basename-match) scaffold rename — BITMAP today. */
export function conditionalScaffoldRenameStores(): string[] {
  return SIBLING_ASSET_STORES.filter((s) => s.scaffoldRename === "bitmap-conditional").map((s) => s.name);
}

/** Store names stripped from a preview compile only when their file is absent from the VFS. */
export function danglingPreviewStripStores(): Set<string> {
  return new Set(SIBLING_ASSET_STORES.filter((s) => s.previewStrip === "dangling").map((s) => s.name));
}

/** Store names stripped from a preview compile unconditionally. */
export function alwaysPreviewStripStores(): Set<string> {
  return new Set(SIBLING_ASSET_STORES.filter((s) => s.previewStrip === "always").map((s) => s.name));
}

/** Store names whose stale sibling reference reconcileSiblingAssetPaths will repair. */
export function reconcileRepairStores(): Set<string> {
  return new Set(SIBLING_ASSET_STORES.filter((s) => s.reconcileRepair).map((s) => s.name));
}

/**
 * The sibling-file extensions `renameFilesInVfs` (scaffolder) renames on a
 * scaffold identity rename. Excludes DISPLAYMAP/INCLUDECODES, which have no
 * `extension` (see {@link SiblingAssetStoreEntry.extension}). Does NOT
 * include `.kmn`/`.kps` — those are not asset-store entries and are handled
 * separately by `renameFilesInVfs`.
 */
export function assetFileExtensions(): string[] {
  return SIBLING_ASSET_STORES.filter((s) => s.extension !== undefined).map((s) => s.extension as string);
}

// oskAssetShared — helpers shared by the OSK layer-asset patchers so their
// path-resolution and text-handling logic cannot drift.
//
// Both patchers edit the on-screen-keyboard layer files (`.kvks` visual
// keyboard and `.keyman-touch-layout`) in the VirtualFS:
//
// @see applyKeycapLabelsToVfs.ts        — sets keycap labels for S-01/S-08 assignments
// @see applyCarveKeycapRemovalsToVfs.ts — blanks keycaps for carved characters

import type { VirtualFS } from "@keyboard-studio/contracts";
import { parseKmnHeaderStores } from "../compiler/parseKmnHeaderStores.js";

/**
 * Read a VFS entry as text. Returns `undefined` when the entry is missing or
 * marked binary; decodes `Uint8Array` content via `TextDecoder`.
 */
export function readVfsText(vfs: VirtualFS, path: string): string | undefined {
  const entry = vfs.get(path);
  if (entry === undefined || entry.isBinary) return undefined;
  return typeof entry.content === "string"
    ? entry.content
    : new TextDecoder().decode(entry.content as Uint8Array);
}

/**
 * Resolve the VFS path for a sibling asset file.
 *
 * 1. Look for the store in parsed header stores and return `source/<path>`.
 * 2. Fall back to `source/<keyboardId><extension>`.
 */
export function resolveAssetPath(
  stores: ReturnType<typeof parseKmnHeaderStores>,
  storeName: string,
  keyboardId: string,
  extension: string,
): string {
  const store = stores.find((s) => s.storeName === storeName);
  if (store?.path) {
    // Paths in .kmn headers are relative to source/
    return `source/${store.path}`;
  }
  return `source/${keyboardId}${extension}`;
}

/**
 * Resolve the `.kvks` and `.keyman-touch-layout` VFS paths for a keyboard by
 * reading its `.kmn` header stores (&VISUALKEYBOARD / &LAYOUTFILE), falling
 * back to `source/<keyboardId>.<ext>` when a store is absent or the `.kmn`
 * itself is missing/binary.
 */
export function resolveOskAssetPaths(
  vfs: VirtualFS,
  keyboardId: string,
): { kvksPath: string; touchPath: string } {
  const kmnText = readVfsText(vfs, `source/${keyboardId}.kmn`) ?? "";
  const headerStores = kmnText ? parseKmnHeaderStores(kmnText) : [];
  return {
    kvksPath: resolveAssetPath(headerStores, "VISUALKEYBOARD", keyboardId, ".kvks"),
    touchPath: resolveAssetPath(
      headerStores,
      "LAYOUTFILE",
      keyboardId,
      ".keyman-touch-layout",
    ),
  };
}

/**
 * XML-escape a character for insertion into `.kvks` text content.
 */
export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Inverse of {@link xmlEscape}, extended to the full set of predefined XML
 * entities plus numeric character references, so `.kvks` key text that a
 * keyboard author entity-encoded (`&#x00E9;`, `&eacute;` is NOT supported —
 * only predefined names) compares equal to its literal character.
 *
 * `&amp;` is decoded LAST so `&amp;lt;` yields `&lt;` (literal), not `<`.
 */
export function xmlUnescape(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Escape a string for safe use inside a `new RegExp(…)` pattern.
 */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

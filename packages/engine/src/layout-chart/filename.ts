/**
 * filename — the deterministic `ks-layout-<platform>-<layer>.svg` naming
 * convention for generated layout charts (spec 076 T047, FR-015).
 */

import type { LayoutChartPlatform } from "@keyboard-studio/contracts";

/**
 * Reserved prefix for every generated layout chart (FR-015 collision
 * guarantee): a corpus survey found no hand-authored welcome-folder image
 * using it, so a file carrying this prefix can always be recognized as one of
 * ours among a base's free-form image names.
 */
export const LAYOUT_CHART_PREFIX = "ks-layout-";

const ALLOWED_CHAR_RE = /[a-z0-9_-]/;

function hexEscape(codePoint: number): string {
  return `_x${codePoint.toString(16)}_`;
}

/**
 * Sanitize a layer id into the filename-safe `[a-z0-9_-]` alphabet: lowercase
 * first, then replace every code point outside that alphabet with a
 * deterministic `_xNN_` hex escape (`NN` = the code point's lowercase hex
 * digits). Total and collision-free for every layer id this codebase itself
 * mints (combo fragments, `.kvks` shift tokens, `.keyman-touch-layout` layer
 * ids) — none of those legitimately contain a literal `_x..._`-shaped run, so
 * this escaping cannot be confused with an escaped character in practice, even
 * though it is not a universal collision-free scheme for arbitrary input.
 */
export function sanitizeLayerIdForFilename(layerId: string): string {
  let out = "";
  for (const ch of layerId.toLowerCase()) {
    out += ALLOWED_CHAR_RE.test(ch) ? ch : hexEscape(ch.codePointAt(0) ?? 0);
  }
  return out;
}

/** `ks-layout-<platform>-<sanitizedLayer>.svg` — a pure function of `(platform, layerId)` (FR-015). */
export function layoutChartFilename(platform: LayoutChartPlatform, layerId: string): string {
  return `${LAYOUT_CHART_PREFIX}${platform}-${sanitizeLayerIdForFilename(layerId)}.svg`;
}

/** True when `filename` carries the reserved {@link LAYOUT_CHART_PREFIX}. */
export function isLayoutChartFilename(filename: string): boolean {
  return filename.startsWith(LAYOUT_CHART_PREFIX);
}

const LAYOUT_CHART_PLATFORMS: readonly LayoutChartPlatform[] = ["desktop", "phone", "tablet"];

/**
 * The platform encoded in a `ks-layout-<platform>-...` filename, or
 * `undefined` when `filename` does not carry the reserved prefix followed by
 * a recognized platform segment. Lets a caller (spec 076 T051's welcome-folder
 * grouping) sort carried files by platform without re-deriving this naming
 * convention.
 */
export function layoutChartPlatformFromFilename(filename: string): LayoutChartPlatform | undefined {
  if (!isLayoutChartFilename(filename)) return undefined;
  const rest = filename.slice(LAYOUT_CHART_PREFIX.length);
  return LAYOUT_CHART_PLATFORMS.find((platform) => rest.startsWith(`${platform}-`));
}

// Shared physical-key display convention for the desktop key-naming-
// ambiguity fix: a physical key is named by its unshifted, LOWERCASE glyph
// for ordinary letter keys (K_Q -> "q"), never the bare uppercase vkey
// letter — a bare "Q" in suggestion/diagnostic text reads as the capital
// *character* Q, not the physical q key. Digits/symbols are unchanged;
// named keys (Backspace, Tab, …) keep their existing caption. Any casing
// implied by a modifier (Shift, Caps) is conveyed by the modifier word in
// the surrounding chord text ("Shift + q"), never by casing the key letter
// itself — see the chosen convention in the ambiguity-fix task.
//
// Reuses `vkeyLabel`'s existing named-key/digit/symbol resolution table
// (irToCarveNodes.ts) rather than a second copy of it; only letter keys get
// the additional lowercase pass this convention adds on top.
//
// `irToCarveNodes.ts`'s OWN desktop-label choke point, `desktopVkeyLabel`,
// applies the identical lowercase-letter pass. Both sites share the ONE rule
// via the import-free `lowerBareLetter` leaf in `keyCasing.ts` — this module
// already imports `vkeyLabel` FROM `irToCarveNodes.ts`, so a direct import
// between the two would be circular; the shared rule sits below both instead.
//
// TouchGallery's `hostKeyShortLabel` is a DIFFERENT, already-correct casing
// convention (spec 074): a touch key's displayed case reflects the touch
// LAYER it targets (uppercase on a shift/caps layer), because a touch
// keycap visually shows that layer's own glyph — it is not the same
// question this module answers, so it is left as-is. `stripVkeyPrefix`
// below is the one piece of literal logic the two conventions share (peel
// the "K_" vkey-namespace prefix); each caller still applies its own casing
// rule on top of it.

import { vkeyLabel } from "./irToCarveNodes.ts";
import { lowerBareLetter } from "./keyCasing.ts";

/**
 * Strip the "K_" vkey-namespace prefix, or return the name unchanged if it
 * doesn't carry one. Shared building block for every key-label convention
 * in the studio (desktop and touch) — never inline `replace(/^K_/, "")` or
 * `slice(2)` at a call site.
 */
export function stripVkeyPrefix(vkeyName: string): string {
  return vkeyName.startsWith("K_") ? vkeyName.slice(2) : vkeyName;
}

/**
 * Desktop physical-key display label under the keycap convention: ordinary
 * letter keys lowercase ("q"), digits/symbols/named keys unchanged from
 * `vkeyLabel`'s existing resolution ("5", "[", "Backspace"). Returns
 * undefined only when `vkeyLabel` itself can't resolve the name (blank
 * input) — callers should fall back to `stripVkeyPrefix` + a generic label
 * in that case, same as `vkeyLabel`'s other callers do.
 */
export function physicalKeyLabel(vkeyName: string): string | undefined {
  const label = vkeyLabel(vkeyName);
  if (label === undefined) return undefined;
  return lowerBareLetter(label);
}

/**
 * The complete desktop key-naming convention with its fallback baked in:
 * `physicalKeyLabel`'s resolved caption, or a bare `stripVkeyPrefix` of the
 * name when `vkeyLabel` can't resolve it. This is the one shared spelling of
 * the `physicalKeyLabel(x) ?? stripVkeyPrefix(x)` pair — call this rather than
 * re-inlining the `??` at every key-naming site. Callers whose input may be a
 * non-vkey token (an already-resolved glyph) still guard on `startsWith("K_")`
 * before calling — see `GlyphCell`.
 */
export function keyLabelOrRaw(vkeyName: string): string {
  return physicalKeyLabel(vkeyName) ?? stripVkeyPrefix(vkeyName);
}

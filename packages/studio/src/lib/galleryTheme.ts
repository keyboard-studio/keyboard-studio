// Re-export shim — all token definitions live in ui/theme.ts (FR-003 / SC-004).
// Do NOT add token values here. To change a value, edit ui/theme.ts.
export {
  BG_PAGE,
  BG_CARD,
  BORDER,
  ACCENT,
  TEXT_DIM,
  TEXT_MAIN,
  FONT,
  BLUE_ACTION,
} from "../ui/theme.ts";

// ---------------------------------------------------------------------------
// Shared gallery style presets
//
// These are composed CSSProperties objects, NOT primitive tokens (the "do not
// add token values" note above is about the hex/font values re-exported from
// ui/theme.ts). They were byte-identical consts hand-copied across
// MechanismGallery.tsx, SequenceGallery.tsx, and TouchGallery.tsx; consolidated
// here so the galleries can no longer drift apart. A gallery whose page needs
// its own variant (e.g. SequenceGallery's flex-column page layout) spreads one
// of these as a base and layers its own overrides locally rather than
// redefining the whole object.
// ---------------------------------------------------------------------------

import type { CSSProperties } from "react";
import { BG_PAGE, BORDER, TEXT_DIM, TEXT_MAIN, FONT, BLUE_ACTION } from "../ui/theme.ts";

/** Base page-level style shared by the mechanism/sequence/touch galleries' guard/content branches. */
export const galleryPageStyle: CSSProperties = {
  background: BG_PAGE,
  height: "100%",
  boxSizing: "border-box",
  fontFamily: FONT,
  color: TEXT_MAIN,
};

/** Transparent bordered "Back" / secondary button shared by all three galleries. */
export const galleryGhostBtn: CSSProperties = {
  padding: "8px 18px",
  background: "transparent",
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  color: TEXT_DIM,
  fontSize: 13,
  cursor: "pointer",
  fontFamily: "inherit",
};

/**
 * Always-enabled primary forward ("Next character" / "Continue" / "Done")
 * button base. A gated variant (disabled until the current character is
 * applied) spreads this and overrides background/color/cursor.
 */
export const galleryForwardBtnStyle: CSSProperties = {
  padding: "9px 20px",
  background: BLUE_ACTION,
  border: "none",
  borderRadius: 6,
  color: "#e6edf3",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: FONT,
};

/**
 * Monospace character-entry box shared by MechanismGallery's deadkey
 * trigger/base-letter boxes and SequenceGallery's Content/Indicator boxes.
 */
export const galleryInputStyle: CSSProperties = {
  width: 52,
  padding: "6px 8px",
  background: BG_PAGE,
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  color: TEXT_MAIN,
  fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace",
  fontSize: 20,
  textAlign: "center",
  boxSizing: "border-box",
};

/**
 * SelectMenu's trigger already carries the same colors the pre-migration
 * native <select> set explicitly (BG_PAGE/BORDER/TEXT_MAIN, byte-identical
 * values — see ui/theme.ts); only a width override is still needed since a
 * native <select> auto-sizes to content but SelectMenu's trigger is
 * width: 100%. Shared by KeyPickerField/MechanismGallery/TouchGallery so a
 * fourth SelectMenu migration doesn't hand-copy a fourth near-identical const.
 */
export const gallerySelectMenuStyle = (width: number): CSSProperties => ({ width, fontSize: 12 });

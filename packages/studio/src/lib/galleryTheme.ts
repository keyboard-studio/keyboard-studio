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
// MechanismGallery.tsx and TouchGallery.tsx (and formerly the retired
// SequenceGallery.tsx — its sequence-builder UI now lives inline in
// MechanismGallery.tsx's SequenceBuilderPanel.tsx); consolidated here so the
// galleries can no longer drift apart. A gallery whose page needs its own
// variant spreads one of these as a base and layers its own overrides
// locally rather than redefining the whole object.
// ---------------------------------------------------------------------------

import type { CSSProperties } from "react";
import { BG_PAGE, BORDER, ACCENT, TEXT_DIM, TEXT_MAIN, FONT, BLUE_ACTION } from "../ui/theme.ts";

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
  color: "var(--app-text-on-accent)",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: FONT,
};

/**
 * Monospace character-entry box shared by MechanismGallery's deadkey
 * trigger/base-letter boxes and SequenceBuilderPanel's Content/Indicator boxes.
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

/**
 * Transparent, full-width method-card header button — shared by
 * MethodChooser (MechanismGallery.tsx) and TouchMethodChooser
 * (TouchGallery.tsx); byte-identical across both prior to consolidation.
 */
export const galleryHeaderBtnStyle: CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  background: "transparent",
  border: "none",
  color: TEXT_MAIN,
  fontSize: 13,
  fontFamily: FONT,
  cursor: "pointer",
  textAlign: "left",
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

/**
 * Method-card header ROW — lays the title-toggle button and the card's
 * Apply control side by side on one line. Shared by MethodChooser
 * (MechanismGallery.tsx) and TouchMethodChooser (TouchGallery.tsx); factored
 * here so the two galleries can no longer drift apart (see file header).
 */
export const galleryCardHeaderRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
};

/**
 * Title-toggle button INSIDE a card header row — the shared
 * `galleryHeaderBtnStyle` (full-width, column-stacked title/summary) reduced
 * to `width: "auto"` and told to `flex: 1` so it takes the row's remaining
 * space beside the Apply control. Shared by both galleries' card headers.
 */
export const galleryHeaderTitleBtnStyle: CSSProperties = {
  ...galleryHeaderBtnStyle,
  width: "auto",
  flex: 1,
};

/**
 * Inline config-panel wrapper shown below an expanded method-card header —
 * shared by MethodChooser and TouchMethodChooser.
 */
export const galleryConfigStyle: CSSProperties = {
  padding: "0 14px 12px",
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

/**
 * Method-card container style — active card gets an accent border and dark
 * highlight background; shared by MethodChooser and TouchMethodChooser.
 *
 * `overflow` is deliberately "visible", not "hidden". A key-picker
 * (KeyPickerField -> ui/SelectMenu) or layer-slot dropdown living inside an
 * expanded card's config panel renders its open option list as an
 * absolutely-positioned `<ul>` (SelectMenu's LIST_STYLE) — a descendant of
 * this card. `overflow: hidden` would clip that list to the card's rounded
 * border instead of letting it float above surrounding content. The
 * rounded-corner containment `overflow: hidden` used to buy (keeping the
 * active card's #0d2840 background inside the 8px border-radius) isn't
 * actually needed: every direct child here (the header button, the config
 * div) is `background: "transparent"` (see galleryHeaderBtnStyle /
 * galleryConfigStyle above), so the card's own background paints the full
 * rounded box regardless.
 */
export const galleryCardStyle = (active: boolean): CSSProperties => ({
  borderRadius: 8,
  border: `1px solid ${active ? ACCENT : BORDER}`,
  background: active ? "var(--app-accent-subtle)" : BG_PAGE,
  overflow: "visible",
  transition: "border-color 120ms ease, background 120ms ease",
});

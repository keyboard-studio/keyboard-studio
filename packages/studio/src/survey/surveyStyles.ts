// Shared style constants for the survey phase components (PhaseA/B/F,
// QuestionField, and the StudioShell SurveyView pane).
//
// Colors are re-exported/aliased from `../ui/theme.ts` — that module already
// owns the exact hex literals for the dark survey palette (BG_PAGE, BG_CARD,
// BORDER, ACCENT, TEXT_DIM, TEXT_MAIN, FONT, BLUE_ACTION) and its header
// comment locks those values (FR-005 zero-diff). This module does NOT
// re-declare them; it only composes them into the repeated shapes that were
// previously duplicated as inline style literals.
//
// A handful of survey-only colors have no counterpart in theme.ts (which is
// a gallery-compat layer); they are named here instead of scattered as raw
// hex across the phase components.
//
// ZERO VISUAL REGRESSION: every exported value/object below was extracted
// verbatim (including key order, which affects the emitted `style` attribute
// order) from its call sites. When a call site needs one extra property on
// top of a shared shape, compose via spread in the position that reproduces
// the original key order — do not assume spread order is irrelevant.

import type { CSSProperties } from "react";
import {
  BG_PAGE,
  BG_CARD,
  BORDER,
  ACCENT,
  TEXT_DIM,
  TEXT_MAIN,
  FONT,
  BLUE_ACTION,
} from "../ui/theme.ts";

export { BG_PAGE, BG_CARD, BORDER, ACCENT, TEXT_DIM, TEXT_MAIN, FONT, BLUE_ACTION };

// ---------------------------------------------------------------------------
// Survey-only colors — no counterpart in ui/theme.ts (do not add them there;
// theme.ts is a locked-value gallery-compat layer).
// ---------------------------------------------------------------------------

/** Chip glyph accent — the confirmed/checked character glyph color. */
export const CHIP_GLYPH_ACCENT = "#58a6ff";

/** Error / danger red — the chip remove-x glyph and error-text color. */
export const ERROR_RED = "#f85149";

/** Checked chip background (SuggestionChip, ticked state). */
export const CHECKED_CHIP_BG = "#0d2044";

/** Disabled-control background / divider line color (same value, dual use). */
export const DISABLED_DIVIDER = "#21262d";

// ---------------------------------------------------------------------------
// Phase wrapper — identical across PhaseA, PhaseB (manual path), PhaseF.
// ---------------------------------------------------------------------------

export const phaseContainer: CSSProperties = {
  background: BG_PAGE,
  color: TEXT_MAIN,
  fontFamily: FONT,
};

/** The phase `<h2>` heading with its 20px bottom margin (PhaseA/B/F). */
export const phaseHeading: CSSProperties = {
  margin: "0 0 20px 0",
  fontSize: "1.1rem",
  color: ACCENT,
  fontWeight: 600,
};

/**
 * The flush (`margin: 0`) heading variant — used where the heading is the
 * first element in a flex column that already supplies its own gap
 * (BuildListView, IntroChooser, StudioShell donePaneContent).
 */
export const phaseHeadingFlush: CSSProperties = {
  margin: 0,
  fontSize: "1.1rem",
  color: ACCENT,
  fontWeight: 600,
};

// ---------------------------------------------------------------------------
// Muted helper text
// ---------------------------------------------------------------------------

/** Muted note in a plain `<div>` — no margin (SuggestionPanel status lines). */
export const mutedNote: CSSProperties = {
  fontSize: 13,
  color: TEXT_DIM,
};

/** Muted note in a `<p>` with an explicit flush margin. */
export const mutedParaFlush: CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: TEXT_DIM,
};

// ---------------------------------------------------------------------------
// Section heading (BuildListView `<h3>`s)
// ---------------------------------------------------------------------------

export const sectionHeading: CSSProperties = {
  margin: "0 0 10px 0",
  fontSize: "0.95rem",
  color: TEXT_MAIN,
  fontWeight: 600,
};

// ---------------------------------------------------------------------------
// Divider `<hr>` (BuildListView)
// ---------------------------------------------------------------------------

export const divider: CSSProperties = {
  border: "none",
  borderTop: `1px solid ${DISABLED_DIVIDER}`,
  margin: 0,
};

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

/** Secondary / "Back" button — transparent background, dim text. */
export const secondaryButton: CSSProperties = {
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
 * Primary action button, with the shared disabled treatment (dim background,
 * dim text, not-allowed cursor). `primaryButton(false)` reproduces the
 * always-enabled call sites (e.g. IntroChooser's "Continue").
 */
export function primaryButton(disabled: boolean): CSSProperties {
  return {
    padding: "8px 18px",
    background: disabled ? DISABLED_DIVIDER : BLUE_ACTION,
    border: `1px solid ${BORDER}`,
    borderRadius: 6,
    color: disabled ? TEXT_DIM : TEXT_MAIN,
    fontSize: 13,
    cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "inherit",
  };
}

// ---------------------------------------------------------------------------
// Character chips (CharChipEditor / SuggestionChip)
// ---------------------------------------------------------------------------

/** The chip button shell — `checked` selects the accent border/background. */
export function charChip(checked: boolean): CSSProperties {
  return {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "6px 10px",
    border: `1px solid ${checked ? BLUE_ACTION : BORDER}`,
    borderRadius: 8,
    background: checked ? CHECKED_CHIP_BG : BG_CARD,
    cursor: "pointer",
    gap: 2,
    minWidth: 44,
  };
}

/** The chip's large glyph span — `checked` (or "confirmed") selects accent color. */
export function chipGlyph(checked: boolean): CSSProperties {
  return {
    fontSize: 22,
    fontFamily: "system-ui, sans-serif",
    lineHeight: 1,
    color: checked ? CHIP_GLYPH_ACCENT : TEXT_DIM,
  };
}

/** The chip's small U+XXXX codepoint label — identical in both chip variants. */
export const chipCodepoint: CSSProperties = {
  fontSize: 9,
  color: TEXT_DIM,
  fontFamily: "monospace",
};

// ---------------------------------------------------------------------------
// QuestionField help text (formerly QuestionField.tsx's local HELP_STYLE)
// ---------------------------------------------------------------------------

export const helpText: CSSProperties = {
  fontSize: 12,
  color: TEXT_DIM,
  lineHeight: 1.5,
  marginBottom: 10,
  whiteSpace: "pre-wrap",
};

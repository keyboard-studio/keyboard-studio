// Shared style constants for the survey phase components (PhaseA/B/F,
// QuestionField, and the StudioShell SurveyView pane).
//
// All colors come from `../ui/theme.ts` — the shared dark palette (BG_PAGE,
// BG_CARD, BORDER, ACCENT, TEXT_DIM, TEXT_MAIN, FONT, BLUE_ACTION) plus the
// survey-specific tokens (CHIP_GLYPH_ACCENT, ERROR_RED, CHECKED_CHIP_BG,
// DISABLED_DIVIDER) that live in theme.ts §3 "Divergent / preserved tokens"
// alongside the other component-specific colors (ERROR_TEXT, WARNING, …).
// This module does NOT declare any hex; it re-exports the tokens for
// call-site convenience and composes them into the repeated shapes that were
// previously duplicated as inline style literals.
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
  CHIP_GLYPH_ACCENT,
  ERROR_RED,
  CHECKED_CHIP_BG,
  DISABLED_DIVIDER,
  CSS_TEXT_ON_ACCENT,
} from "../ui/theme.ts";

export {
  BG_PAGE,
  BG_CARD,
  BORDER,
  ACCENT,
  TEXT_DIM,
  TEXT_MAIN,
  FONT,
  BLUE_ACTION,
  CHIP_GLYPH_ACCENT,
  ERROR_RED,
  CHECKED_CHIP_BG,
  DISABLED_DIVIDER,
};

// ---------------------------------------------------------------------------
// Phase wrapper — identical across PhaseA, PhaseB (manual path), PhaseF.
// ---------------------------------------------------------------------------

export const phaseContainer: CSSProperties = {
  background: BG_PAGE,
  color: TEXT_MAIN,
  fontFamily: FONT,
};

/**
 * The phase `<h2>` screen title (PhaseA/B/F, and — via the survey card
 * shells below — FlowStepHost/IdentityLite/Prefill). Epic #533: this used
 * to be `fontSize: "1.1rem"` in the accent color, which read as a debug-
 * panel label rather than a product screen title. Now the display face
 * (Playfair Display) at a real heading size, set in the primary text color
 * — the accent is reserved for the survey card's top rule, not the title
 * text itself.
 */
export const phaseHeading: CSSProperties = {
  margin: "0 0 20px 0",
  fontFamily: "var(--app-display)",
  fontSize: 30,
  fontWeight: 600,
  letterSpacing: "-0.01em",
  lineHeight: 1.25,
  color: TEXT_MAIN,
};

/**
 * The flush (`margin: 0`) heading variant — used where the heading is the
 * first element in a flex column that already supplies its own gap
 * (PhaseB's BuildListView and IntroChooser).
 */
export const phaseHeadingFlush: CSSProperties = {
  ...phaseHeading,
  margin: 0,
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
// Divider `<hr>` (PunctuationStep)
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
    // Enabled state sits on the ACCENT fill, so it needs the on-accent token,
    // not the page text colour. TEXT_MAIN here measured 2.43:1 on light and
    // 2.25:1 on navy — unreadable in both themes, and invisible to the old
    // gate because nothing scanned a screen with a primary button on it.
    color: disabled ? TEXT_DIM : CSS_TEXT_ON_ACCENT,
    fontSize: 13,
    cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "inherit",
  };
}

// ---------------------------------------------------------------------------
// Character chips (CharChipEditor / SuggestionChip)
// ---------------------------------------------------------------------------

/**
 * The chip button shell — `checked` selects the accent border/background.
 * `scale` (default 1, byte-identical to the pre-zoom shape) proportionally
 * scales padding/gap/minWidth — CharacterMapPane's zoom control threads its
 * `zoom` state factor through here so the flex-wrap grid reflows naturally
 * around larger/smaller chips, rather than a CSS `transform: scale()` on the
 * container (which would break wrapping/overflow/scroll).
 */
export function charChip(checked: boolean, scale = 1): CSSProperties {
  return {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: `${6 * scale}px ${10 * scale}px`,
    border: `1px solid ${checked ? BLUE_ACTION : BORDER}`,
    borderRadius: 8,
    background: checked ? CHECKED_CHIP_BG : BG_CARD,
    cursor: "pointer",
    gap: 2 * scale,
    minWidth: 44 * scale,
  };
}

/** Default glyph font stack — used when no `fontStack` override is passed. */
const DEFAULT_CHIP_GLYPH_FONT_STACK = "system-ui, sans-serif";

/**
 * The chip's large glyph span — `checked` (or "confirmed") selects accent
 * color. `fontStack` overrides the rendering font (Phase B font-selection
 * dropdown, see FONT_OPTIONS below); omitted, it falls back to the original
 * system-ui stack so existing callers are unaffected. `scale` (default 1,
 * byte-identical to the pre-zoom shape) proportionally scales the rendered
 * glyph's font size — CharacterMapPane's zoom control.
 */
export function chipGlyph(checked: boolean, fontStack?: string, scale = 1): CSSProperties {
  return {
    fontSize: 22 * scale,
    fontFamily: fontStack ?? DEFAULT_CHIP_GLYPH_FONT_STACK,
    lineHeight: 1,
    color: checked ? CHIP_GLYPH_ACCENT : TEXT_DIM,
  };
}

/**
 * Deterministic box placeholder shown in place of a glyph the selected
 * Phase B font can't render (see fontSupport.ts) — a fixed-size bordered box,
 * NOT reliance on the browser/OS's own missing-glyph ("tofu") rendering,
 * which is inconsistent across systems (some draw a visible box, some draw
 * blank). Shaped as a VERTICAL RECTANGLE (taller than wide), matching a
 * typical glyph slot/tofu box rather than a square swatch — 14px wide by
 * 24px tall, sized to sit comfortably against chipGlyph's 22px glyph
 * footprint so the chip layout doesn't jump excessively between glyph and
 * box cells. `checked` mirrors chipGlyph's accent-color selection.
 *
 * This is deliberately CSS-drawn (a bordered box, no text glyph inside) —
 * font-independent, so it can never itself render as tofu the way a stand-in
 * character (e.g. U+A7F1) could if that character happened to be missing
 * from the active font too.
 *
 * NEVER applied to a combining mark cell — see the isCombiningMark gate at
 * CharacterMapPane's render site; a standalone mark always renders the
 * dotted-circle glyph instead, regardless of what the font-support heuristic
 * reports (that heuristic misfires on zero-advance-width marks — see
 * fontSupport.ts's isGlyphSupported doc comment).
 *
 * `scale` (default 1, byte-identical to the pre-zoom shape) proportionally
 * scales the box footprint — CharacterMapPane's zoom control, so the box
 * fallback stays sized against chipGlyph's glyph footprint at any zoom level.
 */
export function chipGlyphMissingBox(checked: boolean, scale = 1): CSSProperties {
  return {
    display: "inline-block",
    width: 14 * scale,
    height: 24 * scale,
    boxSizing: "border-box",
    border: `1.5px solid ${checked ? CHIP_GLYPH_ACCENT : TEXT_DIM}`,
    borderRadius: 2,
  };
}

// ---------------------------------------------------------------------------
// Phase B character font selection — the dropdown at the top of the
// build-list step applies one font to every glyph rendered while adding
// characters (chip editor, suggestion chips, character map). Modeled as a
// single typed const so the CSS font-family stack lives in one place and both
// the dropdown options and chipGlyph() draw from it.
// ---------------------------------------------------------------------------

/** The set of font choices offered on the Phase B build-list step.
 *
 * Intentionally independent of the `--ui`/`--serif` tokens (src/index.css)
 * and `FONT`/`FONT_MONO` (src/ui/theme.ts) — those govern UI chrome
 * typography, while Noto Sans / Charis SIL are chosen for glyph coverage of
 * the characters being added, not chrome consistency. Do not consolidate. */
export type PhaseBFontValue = "noto-sans" | "charis-sil";

export interface PhaseBFontOption {
  value: PhaseBFontValue;
  label: string;
  /** CSS font-family stack, always ending in a generic fallback. */
  stack: string;
}

export const FONT_OPTIONS: PhaseBFontOption[] = [
  { value: "noto-sans", label: "Noto Sans", stack: "'Noto Sans', system-ui, sans-serif" },
  { value: "charis-sil", label: "Charis SIL", stack: "'Charis SIL', serif" },
];

/** Default font selection — Noto Sans. */
export const DEFAULT_PHASE_B_FONT: PhaseBFontValue = "noto-sans";

/** Resolve a `PhaseBFontValue` to its CSS font-family stack, falling back to the default. */
export function phaseBFontStack(value: string): string {
  return FONT_OPTIONS.find((o) => o.value === value)?.stack ?? FONT_OPTIONS[0]!.stack;
}

/** Type guard — is `value` one of the known Phase B font choices? */
export function isPhaseBFontValue(value: unknown): value is PhaseBFontValue {
  return typeof value === "string" && FONT_OPTIONS.some((o) => o.value === value);
}

/**
 * The chip's small U+XXXX codepoint label — identical in both chip variants.
 * `scale` (default 1, byte-identical to the pre-zoom shape) proportionally
 * scales the label's font size — CharacterMapPane's zoom control. A function
 * (not a plain const) so every call site — including the two chip variants in
 * PhaseB.tsx that never zoom — passes through unaffected at the default.
 */
export function chipCodepoint(scale = 1): CSSProperties {
  return {
    fontSize: 9 * scale,
    color: TEXT_DIM,
    fontFamily: "monospace",
  };
}

/**
 * The chip's non-color selected-indicator span shell — `fontSize: 10` plus a
 * caller-supplied `color`, colorblind-safe alongside a text marker (never
 * color alone). Extracted (P2 synthesis) from three duplicated inline spans
 * that shared this exact shape but not always the same color/text: the
 * SuggestionChip toggle chip and the CharChipEditor delete chip in
 * PhaseB.tsx, and CharacterMapPane's cell. The color/text stay call-site
 * parameters (rather than folded into a `selected: boolean` signature) so
 * CharChipEditor's ERROR_RED "x" — a fixed, non-toggle visual state, per its
 * own inline comment — round-trips through this helper unchanged, alongside
 * the two real toggles' CHIP_GLYPH_ACCENT/TEXT_DIM "[x]"/"+" pair.
 *
 * `scale` (default 1, byte-identical to the pre-zoom shape) proportionally
 * scales the indicator's font size — CharacterMapPane's zoom control, the
 * same parameter shape as its charChip/chipGlyph/chipGlyphMissingBox/
 * chipCodepoint siblings above, so the marker doesn't stay undersized while
 * the glyph around it grows.
 */
export function chipIndicator(color: string, scale = 1): CSSProperties {
  return {
    fontSize: 10 * scale,
    color,
  };
}

/** The two real toggle chips' (SuggestionChip / CharacterMapPane) indicator text — `"[x]"` selected, `"+"` not. */
export function chipIndicatorText(selected: boolean): string {
  return selected ? "[x]" : "+";
}

/** The two real toggle chips' indicator color — `selected` picks the accent, otherwise dim. */
export function chipIndicatorColor(selected: boolean): string {
  return selected ? CHIP_GLYPH_ACCENT : TEXT_DIM;
}

// ---------------------------------------------------------------------------
// QuestionField help text (formerly QuestionField.tsx's local HELP_STYLE)
// ---------------------------------------------------------------------------

export const helpText: CSSProperties = {
  fontSize: 14,
  color: TEXT_DIM,
  lineHeight: 1.6,
  marginBottom: 10,
  whiteSpace: "pre-wrap",
};

// ---------------------------------------------------------------------------
// Survey card shell (epic #533) — the wrapper every top-level survey step
// (FlowStepHost, IdentityLite, Prefill) renders its title + SurveyRunner
// into. Replaces the old flat `background: "#0d1117"` panel that read as a
// separate near-black product floating in the navy shell: a surface one
// step lighter than the page background, with a thin border and a 3px
// accent rule on top to mark it as "the current step", the same card
// language the rest of the design system uses elsewhere.
// ---------------------------------------------------------------------------

export const surveyCard: CSSProperties = {
  background: BG_CARD,
  color: TEXT_MAIN,
  fontFamily: FONT,
  border: `1px solid ${BORDER}`,
  borderTop: `3px solid ${ACCENT}`,
  borderRadius: "var(--app-radius-lg)",
  padding: 24,
};

/**
 * Centered column the survey card sits in — keeps a long line length
 * readable on a wide pane instead of stretching the card edge-to-edge.
 */
export const surveyPageColumn: CSSProperties = {
  maxWidth: 640,
  margin: "0 auto",
  padding: "40px 24px 64px",
};

/** Lead paragraph under a screen title (e.g. Prefill's intro sentence). */
export const leadParagraph: CSSProperties = {
  margin: "0 0 20px 0",
  fontSize: 15,
  lineHeight: 1.55,
  color: TEXT_DIM,
  maxWidth: 560,
  textWrap: "pretty",
};

// ---------------------------------------------------------------------------
// Visually-hidden (screen-reader-only) label — used to give a group of
// controls (e.g. a RadioGroup) an accessible name via aria-labelledby without
// showing redundant visible text.
// ---------------------------------------------------------------------------

export const visuallyHidden: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};

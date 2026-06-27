// Button — replaces inline NEXT_BTN_ENABLED/DISABLED, BACK_BTN patterns from
// TrackStep.tsx, ProjectNameStep.tsx, and submit buttons from ScaffoldForm.tsx.
//
// FR-005: renders the same <button> element + resolved styles as the inline
// controls it replaces. No color is normalized in P1. Native style/className
// pass-through ensures one-off colors (e.g. ScaffoldForm's #238636 success-green)
// survive exactly when a call site overrides via the style prop (Decision 2).
//
// Variants:
//   "primary"   — NEXT_BTN_ENABLED look (blue CTA). When disabled, renders
//                 NEXT_BTN_DISABLED look instead (transparent + dim text + not-allowed).
//   "secondary" — default; no predefined style (plain button, style pass-through only).
//   "back"      — BACK_BTN look (transparent, bordered, muted).

import React from "react";
import {
  BLUE_ACTION,
  BORDER,
  TEXT_DIM,
  FONT,
} from "./theme.ts";

export type ButtonVariant = "primary" | "secondary" | "back";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Visual treatment. Defaults to "secondary". */
  variant?: ButtonVariant;
};

// ---------------------------------------------------------------------------
// Style constants — verbatim copies of the inline style objects they replace.
// ---------------------------------------------------------------------------

/** Replicates NEXT_BTN_ENABLED from TrackStep.tsx / ProjectNameStep.tsx. */
const STYLE_PRIMARY_ENABLED: React.CSSProperties = {
  padding: "8px 18px",
  background: BLUE_ACTION,      // #1f6feb
  border: `1px solid ${BLUE_ACTION}`,
  borderRadius: 6,
  color: "#fff",
  fontSize: 13,
  cursor: "pointer",
  fontFamily: FONT,
};

/** Replicates NEXT_BTN_DISABLED from TrackStep.tsx / ProjectNameStep.tsx. */
const STYLE_PRIMARY_DISABLED: React.CSSProperties = {
  padding: "8px 18px",
  background: "transparent",
  border: `1px solid ${BORDER}`,  // #30363d
  borderRadius: 6,
  color: "#484f58",
  fontSize: 13,
  cursor: "not-allowed",
  fontFamily: FONT,
};

/** Replicates BACK_BTN from TrackStep.tsx / ProjectNameStep.tsx. */
const STYLE_BACK: React.CSSProperties = {
  marginTop: 20,
  padding: "6px 14px",
  background: "transparent",
  border: `1px solid ${BORDER}`,  // #30363d
  borderRadius: 6,
  color: TEXT_DIM,                // #8b949e
  fontSize: 13,
  cursor: "pointer",
  fontFamily: FONT,
};

/**
 * Shared button primitive.
 *
 * - `variant="primary"` → blue CTA (NEXT_BTN_ENABLED); when `disabled`, renders
 *   the NEXT_BTN_DISABLED look automatically.
 * - `variant="back"` → transparent bordered back arrow button (BACK_BTN).
 * - `variant="secondary"` (default) → no baked style; purely passes through
 *   the native `style`/`className` from the call site.
 *
 * The native `style` prop is merged last so call-site overrides always win.
 */
export function Button({
  variant = "secondary",
  disabled = false,
  style,
  children,
  ...rest
}: ButtonProps): React.ReactElement {
  let baseStyle: React.CSSProperties;

  if (variant === "primary") {
    baseStyle = disabled ? STYLE_PRIMARY_DISABLED : STYLE_PRIMARY_ENABLED;
  } else if (variant === "back") {
    baseStyle = STYLE_BACK;
  } else {
    // secondary — no preset styles; call-site style prop is the whole story
    baseStyle = {};
  }

  return (
    <button
      type="button"
      disabled={disabled}
      style={{ ...baseStyle, ...style }}
      {...rest}
    >
      {children}
    </button>
  );
}

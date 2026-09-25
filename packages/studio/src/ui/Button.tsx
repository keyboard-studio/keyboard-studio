import React from "react";
import {
  BLUE_ACTION,
  BORDER,
  TEXT_DIM,
  FONT,
} from "./theme.ts";
import { mergeClassNames } from "./classNames.ts";

export type ButtonVariant = "primary" | "secondary" | "back";

export type ButtonSize = "default" | "compact";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Visual treatment. Defaults to "secondary". */
  variant?: ButtonVariant;
  /**
   * "compact" fits the 40 px footer (spec 081): tighter padding, no wrapping,
   * no shrinking, and no `back` top margin. Defaults to "default".
   */
  size?: ButtonSize;
};

// Border is split into borderWidth/borderStyle/borderColor (rather than the
// `border: "1px solid <token>"` shorthand) throughout this file: jsdom's
// style-shorthand parser cannot decompose a shorthand value containing an
// unresolved `var(...)`, so `.style.borderColor` reads back empty in tests
// even though a real browser renders it correctly. Longhand sidesteps that
// entirely and is no less readable.
const STYLE_PRIMARY_ENABLED: React.CSSProperties = {
  padding: "8px 18px",
  background: BLUE_ACTION,
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: BLUE_ACTION,
  borderRadius: "var(--app-radius-sm)",
  color: "var(--app-text-on-accent)",
  fontSize: 13,
  cursor: "pointer",
  fontFamily: FONT,
};

// Never recolor AND dim the same element (design handoff rule #2): a
// disabled button uses --app-text-disabled alone, with no opacity stacked
// on top — the muted color already carries the "can't interact" signal.
const STYLE_PRIMARY_DISABLED: React.CSSProperties = {
  padding: "8px 18px",
  background: "transparent",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: BORDER,
  borderRadius: "var(--app-radius-sm)",
  color: "var(--app-text-disabled)",
  fontSize: 13,
  cursor: "not-allowed",
  fontFamily: FONT,
};

const STYLE_BACK: React.CSSProperties = {
  marginTop: 20,
  padding: "6px 14px",
  background: "transparent",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: BORDER,
  borderRadius: "var(--app-radius-sm)",
  color: TEXT_DIM,
  fontSize: 13,
  cursor: "pointer",
  fontFamily: FONT,
};

// Layered over the variant style. About 26 px tall under a fine pointer, which
// clears WCAG 2.5.8's 24 px; under a coarse pointer `.ks-hit-target` still lifts
// it to 44 px, which the 52 px coarse footer holds (index.css).
const STYLE_COMPACT: React.CSSProperties = {
  padding: "4px 12px",
  fontSize: 13,
  whiteSpace: "nowrap",
  flexShrink: 0,
};

export function Button({
  variant = "secondary",
  size = "default",
  disabled = false,
  style,
  className,
  children,
  ...rest
}: ButtonProps): React.ReactElement {
  let baseStyle: React.CSSProperties;

  if (variant === "primary") {
    baseStyle = disabled ? STYLE_PRIMARY_DISABLED : STYLE_PRIMARY_ENABLED;
  } else if (variant === "back") {
    baseStyle = STYLE_BACK;
  } else {
    baseStyle = {};
  }

  if (size === "compact") {
    const { marginTop: _dropped, ...rest } = baseStyle;
    baseStyle = { ...rest, ...STYLE_COMPACT };
  }

  return (
    <button
      type="button"
      disabled={disabled}
      className={mergeClassNames("ks-focus-ring ks-hit-target", className)}
      style={{ ...baseStyle, ...style }}
      {...rest}
    >
      {children}
    </button>
  );
}

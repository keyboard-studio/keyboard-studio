import React from "react";
import {
  BG_CARD,
  BORDER,
  ACCENT,
  TEXT_MAIN,
  FONT,
} from "./theme.ts";

export type CardProps = React.HTMLAttributes<HTMLElement> & {
  /** When true applies the CARD_SELECTED treatment (accent border + dark bg). */
  selected?: boolean;
  /**
   * When true (default when onClick is provided), renders a <button> so the
   * card is natively keyboard-activatable. Pass as={false} to render a <div>
   * for non-interactive display.
   */
  as?: "button" | "div";
};

// Border is split into borderWidth/borderStyle/borderColor (rather than the
// `border: "1px solid <token>"` shorthand): jsdom's style-shorthand parser
// cannot decompose a shorthand value containing an unresolved `var(...)`, so
// `.style.borderColor` reads back empty in tests even though a real browser
// renders it correctly.
const STYLE_BASE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: "12px 16px",
  background: BG_CARD,
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: BORDER,
  borderRadius: "var(--app-radius)",
  color: TEXT_MAIN,
  fontSize: 14,
  cursor: "pointer",
  textAlign: "left",
  fontFamily: FONT,
  width: "100%",
  boxSizing: "border-box" as const,
  transition: "border-color 120ms ease, background 120ms ease, box-shadow 120ms ease",
};

// Selection is always accent border + a 3px accent ring + a subtle accent
// fill — never a drop shadow (design handoff rule #1).
const STYLE_SELECTED: React.CSSProperties = {
  ...STYLE_BASE,
  borderColor: ACCENT,
  boxShadow: "0 0 0 3px var(--app-accent-ring)",
  background: "var(--app-accent-subtle)",
};

/**
 * Clickable card container primitive.
 *
 * Renders as a `<button type="button">` by default (keyboard-activatable).
 * Pass `as="div"` for non-interactive display usage.
 *
 * The `selected` prop switches between CARD_BASE and CARD_SELECTED styles.
 * The native `style` prop is merged last so call-site overrides always win.
 */
export function Card({
  selected = false,
  as = "button",
  style,
  children,
  ...rest
}: CardProps): React.ReactElement {
  const baseStyle = selected ? STYLE_SELECTED : STYLE_BASE;
  const mergedStyle = { ...baseStyle, ...style };

  if (as === "div") {
    return (
      <div style={mergedStyle} {...(rest as React.HTMLAttributes<HTMLDivElement>)}>
        {children}
      </div>
    );
  }

  return (
    <button
      type="button"
      style={mergedStyle}
      {...(rest as React.ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {children}
    </button>
  );
}

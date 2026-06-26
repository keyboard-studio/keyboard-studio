// Card — replaces the CARD_BASE / CARD_SELECTED inline style pattern from
// TrackStep.tsx.
//
// FR-005: renders the same <button> element + resolved styles as the inline
// card buttons it replaces. No color is normalized in P1. Native style/className
// pass-through ensures call-site overrides survive exactly (Decision 2).
//
// The source cards in TrackStep render as <button role="radio"> — callers that
// need role="radio" + aria-checked must pass those as native HTML attributes
// (the div passthrough variant is also supported when onClick is not provided).

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

// ---------------------------------------------------------------------------
// Style constants — verbatim copies of CARD_BASE / CARD_SELECTED from TrackStep.
// ---------------------------------------------------------------------------

/** Replicates CARD_BASE from TrackStep.tsx. */
const STYLE_BASE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: "12px 16px",
  background: BG_CARD,                    // #161b22
  border: `1px solid ${BORDER}`,          // #30363d
  borderRadius: 8,
  color: TEXT_MAIN,                       // #e6edf3
  fontSize: 14,
  cursor: "pointer",
  textAlign: "left",
  fontFamily: FONT,
  width: "100%",
  boxSizing: "border-box" as const,
  transition: "border-color 120ms ease, background 120ms ease",
};

/** Replicates CARD_SELECTED from TrackStep.tsx. */
const STYLE_SELECTED: React.CSSProperties = {
  ...STYLE_BASE,
  border: `1px solid ${ACCENT}`,          // #6ea8fe
  background: "#0d1f38",
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

  // Cast: rest contains HTMLAttributes which are a superset of ButtonHTMLAttributes
  // minus the conflicting ones (style is handled separately).
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

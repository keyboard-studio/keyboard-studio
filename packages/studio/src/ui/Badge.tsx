// Badge — small status tag; replaces the REASON_COLOR <span>s in
// BaseResolution.tsx and the ImportBadge pattern.
//
// FR-005: renders the same element + resolved styles as the inline spans
// in BaseResolution.tsx. BaseResolution uses <span> with REASON_COLOR tokens
// (CSS custom properties). Badge wraps that pattern into a typed primitive.
//
// Source verbatim style (BaseResolution.tsx suggestion button badge):
//   fontSize 11, fontWeight 600, color REASON_COLOR[reason], whiteSpace "nowrap"
//
// Tone map (mirrors REASON_COLOR from BaseResolution.tsx):
//   "success"  → var(--sil-green)           ("language-match")
//   "accent"   → var(--app-accent)           ("script-match")
//   "warn"     → var(--sil-orange-dark)      ("language-cross-script")
//   "subtle"   → var(--app-text-subtle)      ("us-qwerty-fallback")
//   "default"  → var(--app-text-muted)       (generic / unspecified)

import React from "react";
import {
  CSS_SIL_GREEN,
  CSS_ACCENT,
  CSS_SIL_ORANGE_DARK,
  CSS_TEXT_SUBTLE,
  CSS_TEXT_MUTED,
} from "./theme.ts";

export type BadgeTone = "success" | "accent" | "warn" | "subtle" | "default";

export type BadgeProps = {
  tone?: BadgeTone;
  children: React.ReactNode;
  /** Optional inline style — merged AFTER tone styles so caller overrides win. */
  style?: React.CSSProperties;
  /** Optional className forwarded to the rendered <span>. */
  className?: string;
};

const TONE_COLOR: Record<BadgeTone, string> = {
  success: CSS_SIL_GREEN,
  accent: CSS_ACCENT,
  warn: CSS_SIL_ORANGE_DARK,
  subtle: CSS_TEXT_SUBTLE,
  default: CSS_TEXT_MUTED,
};

/**
 * Small inline status tag. Matches the REASON_COLOR <span> pattern in
 * BaseResolution.tsx exactly (fontSize 11, fontWeight 600, whiteSpace nowrap).
 * The `tone` prop selects from the CSS-var token set; call-site style overrides
 * are honored via the native `style` prop if needed.
 */
export function Badge({ tone = "default", children, style, className }: BadgeProps): React.ReactElement {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: TONE_COLOR[tone],
        whiteSpace: "nowrap",
        ...style,
      }}
      className={className}
    >
      {children}
    </span>
  );
}

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

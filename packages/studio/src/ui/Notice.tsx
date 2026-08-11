import React from "react";
import { BG_CARD, BORDER, TEXT_DIM, ERROR_TEXT, ERROR_BORDER, WARNING } from "./theme.ts";

export type NoticeTone = "info" | "warn" | "error";

export type NoticeProps = {
  tone?: NoticeTone;
  children: React.ReactNode;
};

// borderColor (not the `border: "1px solid <token>"` shorthand) per tone:
// jsdom's style-shorthand parser cannot decompose a shorthand value
// containing an unresolved `var(...)`, so `.style.borderColor` reads back
// empty in tests even though a real browser renders it correctly.
const TONE_TOKENS: Record<NoticeTone, { role: React.AriaRole; color: string; borderColor: string }> = {
  info: {
    role: "note",
    color: TEXT_DIM,
    borderColor: BORDER,
  },
  warn: {
    role: "status",
    color: WARNING,
    borderColor: BORDER,
  },
  error: {
    role: "alert",
    color: ERROR_TEXT,
    borderColor: ERROR_BORDER,
  },
};

export function Notice({ tone = "info", children }: NoticeProps): React.ReactElement {
  const tokens = TONE_TOKENS[tone];

  return (
    <div
      role={tokens.role}
      style={{
        padding: "14px 16px",
        background: BG_CARD,
        borderWidth: "1px",
        borderStyle: "solid",
        borderColor: tokens.borderColor,
        borderRadius: "var(--app-radius)",
        fontSize: 13,
        color: tokens.color,
        lineHeight: 1.6,
        whiteSpace: "pre-wrap",
      }}
    >
      {children}
    </div>
  );
}

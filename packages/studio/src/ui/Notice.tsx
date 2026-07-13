import React from "react";
import { BG_CARD, BORDER, TEXT_DIM, ERROR_TEXT, ERROR_BORDER, WARNING } from "./theme.ts";

export type NoticeTone = "info" | "warn" | "error";

export type NoticeProps = {
  tone?: NoticeTone;
  children: React.ReactNode;
};

const TONE_TOKENS: Record<NoticeTone, { role: React.AriaRole; color: string; border: string }> = {
  info: {
    role: "note",
    color: TEXT_DIM,
    border: `1px solid ${BORDER}`,
  },
  warn: {
    role: "status",
    color: WARNING,
    border: `1px solid ${BORDER}`,
  },
  error: {
    role: "alert",
    color: ERROR_TEXT,
    border: `1px solid ${ERROR_BORDER}`,
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
        border: tokens.border,
        borderRadius: 8,
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

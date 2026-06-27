// Notice — read-only banner; replaces NoticeField in QuestionField.tsx.
//
// FR-005: renders the same element + role + resolved styles as the inline
// NoticeField it replaces. NoticeField has no role attribute; Notice adds
// role="note" for the neutral info tone, role="status" for warn, and
// role="alert" for error — these are the least-surprising ARIA roles for
// a static banner at each severity level.
//
// Styles are reproduced verbatim from NoticeField in QuestionField.tsx:
//   padding "14px 16px", background "#161b22", border "1px solid #30363d",
//   borderRadius 8, fontSize 13, color "#8b949e", lineHeight 1.6,
//   whiteSpace "pre-wrap".
//
// Tone variants adjust only color/border for warn and error tones; the
// info (neutral) tone is the verbatim NoticeField appearance.

import React from "react";
import { BG_CARD, BORDER, TEXT_DIM, ERROR_TEXT, ERROR_BORDER, WARNING } from "./theme.ts";

export type NoticeTone = "info" | "warn" | "error";

export type NoticeProps = {
  tone?: NoticeTone;
  children: React.ReactNode;
};

type ToneTokens = {
  role: React.AriaRole;
  color: string;
  border: string;
};

const TONE_TOKENS: Record<NoticeTone, ToneTokens> = {
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

/**
 * Read-only banner primitive. Matches the `NoticeField` <div> in
 * QuestionField.tsx for the default info tone. Accepts `tone` to surface
 * warn/error severity with appropriate ARIA role.
 */
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

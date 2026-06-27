// ErrorText — replaces inline error/warning/hint <div>s in ScaffoldForm.tsx,
// TrackOneIdentityPanel.tsx, and QuestionField.tsx.
//
// FR-005: renders the same element + role + resolved styles as the inline
// controls they replace. Roles mirror current usage exactly:
//   error   → role="alert"   (ScaffoldForm, TrackOneIdentityPanel: role="alert")
//   warning → role="alert"   (no warning-tone alert site exists yet; contract
//             spec says error/warning → role="alert"; preserved as specified)
//   hint    → role="status"  (TrackOneIdentityPanel base-warn: role="status")
//
// Colors (FR-005 zero-diff, no normalization):
//   error   → ERROR_TEXT (#f0a0a0) — verbatim from ScaffoldForm/TrackOneIdentityPanel
//   warning → WARNING    (#d29922) — verbatim from TrackOneIdentityPanel base-warn
//   hint    → CSS_TEXT_MUTED (var(--app-text-muted)) — verified against source

import React from "react";
import { ERROR_TEXT, WARNING, CSS_TEXT_MUTED } from "./theme.ts";

export type ErrorTextProps = {
  /** Tone controls color and ARIA role.
   *  error/warning → role="alert"; hint → role="status" */
  tone: "error" | "warning" | "hint";
  children: React.ReactNode;
};

const TONE_COLOR: Record<ErrorTextProps["tone"], string> = {
  error: ERROR_TEXT,
  warning: WARNING,
  hint: CSS_TEXT_MUTED,
};

const TONE_ROLE: Record<ErrorTextProps["tone"], "alert" | "status"> = {
  error: "alert",
  warning: "alert",
  hint: "status",
};

/**
 * Inline diagnostic text primitive. Matches the `<div role="alert">` and
 * `<div role="status">` patterns in ScaffoldForm.tsx and
 * TrackOneIdentityPanel.tsx exactly (fontSize 12, lineHeight 1.4).
 */
export function ErrorText({ tone, children }: ErrorTextProps): React.ReactElement {
  return (
    <div
      role={TONE_ROLE[tone]}
      style={{
        fontSize: 12,
        color: TONE_COLOR[tone],
        lineHeight: 1.4,
      }}
    >
      {children}
    </div>
  );
}

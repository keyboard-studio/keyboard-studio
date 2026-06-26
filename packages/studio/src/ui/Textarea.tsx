// Textarea — replaces `<textarea>` + INPUT_STYLE from QuestionField.tsx.
//
// FR-005: renders the same element, role, and resolved styles as the inline
// control it replaces. The base INPUT_STYLE values are reproduced verbatim;
// `resize: "vertical"` is always applied (matching the isMultiLine branch).
// `error` variant swaps the border to ERROR_BORDER.
// Native style/className pass-through ensures call-site overrides survive
// exactly (Decision 2).

import React from "react";
import {
  BG_PAGE,
  BORDER,
  TEXT_MAIN,
  FONT,
  ERROR_BORDER,
} from "./theme.ts";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  /** When true, applies ERROR_BORDER (#7a2a2a) as the border color. */
  error?: boolean;
};

/**
 * Multi-line textarea primitive. Matches the `<textarea>` + `INPUT_STYLE`
 * with `resize: "vertical"` rendering in QuestionField.tsx exactly.
 *
 * Extends all native HTMLTextAreaElement props so call sites using arbitrary
 * HTML attributes (id, aria-*, value, onChange, disabled, rows, …) pass
 * through without change.
 */
export function Textarea({
  error = false,
  style,
  ...rest
}: TextareaProps): React.ReactElement {
  const baseStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    background: BG_PAGE,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: error ? ERROR_BORDER : BORDER,
    borderRadius: 6,
    color: TEXT_MAIN,
    fontSize: 14,
    fontFamily: FONT,
    boxSizing: "border-box",
    outline: "none",
    resize: "vertical",
  };

  return (
    <textarea
      style={{ ...baseStyle, ...style }}
      {...rest}
    />
  );
}

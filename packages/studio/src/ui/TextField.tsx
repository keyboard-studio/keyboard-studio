// TextField — replaces `<input type="text">` + INPUT_STYLE from QuestionField.tsx.
//
// FR-005: renders the same element, role, and resolved styles as the inline
// control it replaces. The base INPUT_STYLE values are reproduced verbatim;
// `error` variant swaps the border to ERROR_BORDER; `mono` swaps fontFamily
// to CSS_FONT_MONO. Native style/className pass-through ensures call-site
// overrides survive exactly (Decision 2).

import React from "react";
import {
  BG_PAGE,
  BORDER,
  TEXT_MAIN,
  FONT,
  ERROR_BORDER,
  CSS_FONT_MONO,
} from "./theme.ts";

export type TextFieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  /** When true, applies ERROR_BORDER (#7a2a2a) as the border color. */
  error?: boolean;
  /** When true, applies CSS_FONT_MONO (var(--app-font-mono)) as fontFamily. */
  mono?: boolean;
};

/**
 * Single-line text input primitive. Matches the `<input type="text">` +
 * `INPUT_STYLE` rendering in QuestionField.tsx exactly.
 *
 * Extends all native HTMLInputElement props so call sites using arbitrary
 * HTML attributes (id, aria-*, value, onChange, disabled, placeholder, …)
 * pass through without change.
 */
export function TextField({
  error = false,
  mono = false,
  style,
  ...rest
}: TextFieldProps): React.ReactElement {
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
    fontFamily: mono ? CSS_FONT_MONO : FONT,
    boxSizing: "border-box",
    outline: "none",
  };

  return (
    <input
      type="text"
      style={{ ...baseStyle, ...style }}
      {...rest}
    />
  );
}

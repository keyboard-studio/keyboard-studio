// TextField — replaces `<input type="text">` + INPUT_STYLE from QuestionField.tsx.
//
// FR-005: renders the same element, role, and resolved styles as the inline
// control it replaces. The base INPUT_STYLE values are reproduced verbatim;
// `error` variant swaps the border to ERROR_BORDER; `mono` swaps fontFamily
// to CSS_FONT_MONO. Native style/className pass-through ensures call-site
// overrides survive exactly (Decision 2).
//
// Issue #536: sized to the shared `--control-h` (34px) token instead of a
// fixed padded box, and carries `.ks-control .ks-focus-ring .ks-hit-target`
// (index.css) for the shared height / focus-ring / >=44px touch-target
// conventions. These are additive classes — merged with any caller className,
// never replacing it.

import React from "react";
import {
  BG_PAGE,
  BORDER,
  TEXT_MAIN,
  FONT,
  ERROR_BORDER,
  CSS_FONT_MONO,
} from "./theme.ts";
import { mergeClassNames } from "./classNames.ts";

export type TextFieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  /** When true, applies ERROR_BORDER (#7a2a2a) as the border color. */
  error?: boolean;
  /** When true, applies CSS_FONT_MONO (var(--app-font-mono)) as fontFamily. */
  mono?: boolean;
};

const BASE_STYLE: React.CSSProperties = {
  width: "100%",
  padding: "0 10px",
  background: BG_PAGE,
  borderWidth: "1px",
  borderStyle: "solid",
  borderRadius: 6,
  color: TEXT_MAIN,
  fontSize: 14,
  boxSizing: "border-box",
  outline: "none",
};

/**
 * Single-line text input primitive. Matches the `<input type="text">` +
 * `INPUT_STYLE` rendering in QuestionField.tsx exactly, sized to
 * `--control-h` (34px).
 *
 * Extends all native HTMLInputElement props so call sites using arbitrary
 * HTML attributes (id, aria-*, value, onChange, disabled, placeholder, …)
 * pass through without change.
 */
export function TextField({
  error = false,
  mono = false,
  style,
  className,
  ...rest
}: TextFieldProps): React.ReactElement {
  return (
    <input
      type="text"
      className={mergeClassNames("ks-control ks-focus-ring ks-hit-target", className)}
      style={{
        ...BASE_STYLE,
        borderColor: error ? ERROR_BORDER : BORDER,
        fontFamily: mono ? CSS_FONT_MONO : FONT,
        ...style,
      }}
      {...rest}
    />
  );
}

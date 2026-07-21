// Textarea — replaces `<textarea>` + INPUT_STYLE from QuestionField.tsx.
//
// FR-005: renders the same element, role, and resolved styles as the inline
// control it replaces. The base INPUT_STYLE values are reproduced verbatim;
// `error` variant swaps the border to ERROR_BORDER.
// Native style/className pass-through ensures call-site overrides survive
// exactly (Decision 2).
//
// Issue #536: `resize` defaults to `"none"` — most survey multiline fields
// (short free-text answers) never needed free resize; callers that
// genuinely want it (long-form notes) pass `resize="vertical"` explicitly.
// Carries `.ks-focus-ring .ks-hit-target` (index.css) for the shared
// focus-ring / >=44px touch-target conventions — merged with any caller
// className, never replacing it. Height is left to `rows` (not `--control-h`,
// which sizes single-line controls only).

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
  /**
   * CSS `resize` value. Defaults to `"none"` — free resize is reserved for
   * fields that are genuinely open-ended (long-form notes), opted into by
   * passing `"vertical"` explicitly. Never `"horizontal"`/`"both"` in this
   * codebase's fixed-width layout.
   */
  resize?: "none" | "vertical";
};

const BASE_STYLE: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  background: BG_PAGE,
  borderWidth: "1px",
  borderStyle: "solid",
  borderRadius: 6,
  color: TEXT_MAIN,
  fontSize: 14,
  fontFamily: FONT,
  boxSizing: "border-box",
  outline: "none",
};

/**
 * Multi-line textarea primitive. Matches the `<textarea>` + `INPUT_STYLE`
 * rendering in QuestionField.tsx, with `resize:none` by default (#536).
 *
 * Extends all native HTMLTextAreaElement props so call sites using arbitrary
 * HTML attributes (id, aria-*, value, onChange, disabled, rows, …) pass
 * through without change.
 */
export function Textarea({
  error = false,
  resize = "none",
  style,
  className,
  ...rest
}: TextareaProps): React.ReactElement {
  return (
    <textarea
      className={
        className !== undefined
          ? `ks-focus-ring ks-hit-target ${className}`
          : "ks-focus-ring ks-hit-target"
      }
      style={{
        ...BASE_STYLE,
        borderColor: error ? ERROR_BORDER : BORDER,
        resize,
        ...style,
      }}
      {...rest}
    />
  );
}

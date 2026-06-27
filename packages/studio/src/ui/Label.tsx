// Label — replaces LABEL_STYLE / OPTION_LABEL_STYLE from QuestionField.tsx.
//
// FR-005: renders the same element + role + resolved styles as the inline
// control it replaces. The base LABEL_STYLE values are reproduced verbatim.
// The `required` prop adds the existing #e74c3c asterisk marker.
// Native style/className pass-through ensures call-site overrides survive
// exactly (Decision 2).

import React from "react";
import { TEXT_MAIN } from "./theme.ts";

export type LabelProps = React.HTMLAttributes<HTMLElement> & {
  /**
   * When true, renders the asterisk required marker in #e74c3c with
   * aria-label="required" — matching QuestionField.tsx exactly.
   */
  required?: boolean;
  /**
   * The underlying HTML element to render.
   * - `"label"` (default) — renders a `<label>` element. Accepts `htmlFor`
   *   to associate with an input. Unchanged behavior.
   * - `"span"` — renders a `<span>` element. Use for group headings
   *   (role="radiogroup" / role="group") where `<label>` is semantically
   *   incorrect. Requires `id` so `aria-labelledby` on the group resolves.
   */
  as?: "label" | "span";
  /** Forwarded to the underlying `<label>` element (only used when as="label"). */
  htmlFor?: string | undefined;
};

/**
 * Label primitive. Matches the `<label>` + `LABEL_STYLE` rendering in
 * QuestionField.tsx exactly (fontSize 13, color #e6edf3, fontWeight 600,
 * display block, marginBottom 6). Accepts all native label/span HTML attributes.
 *
 * Use `as="span"` for group headings (radiogroup / checkbox group) where a
 * `<label>` element is semantically incorrect. All styles are identical; only
 * the element tag changes.
 */
export function Label({
  as = "label",
  required,
  style,
  children,
  htmlFor,
  ...rest
}: LabelProps): React.ReactElement {
  const baseStyle: React.CSSProperties = {
    display: "block",
    fontSize: 13,
    color: TEXT_MAIN,
    fontWeight: 600,
    marginBottom: 6,
  };

  const content = (
    <>
      {children}
      {required === true && (
        <span aria-label="required" style={{ color: "#e74c3c", marginLeft: 4 }}>
          *
        </span>
      )}
    </>
  );

  if (as === "span") {
    return (
      <span style={{ ...baseStyle, ...style }} {...rest}>
        {content}
      </span>
    );
  }

  return (
    <label htmlFor={htmlFor} style={{ ...baseStyle, ...style }} {...rest}>
      {content}
    </label>
  );
}

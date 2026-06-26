// Label — replaces LABEL_STYLE / OPTION_LABEL_STYLE from QuestionField.tsx.
//
// FR-005: renders the same element + role + resolved styles as the inline
// control it replaces. The base LABEL_STYLE values are reproduced verbatim.
// The `required` prop adds the existing #e74c3c asterisk marker.
// Native style/className pass-through ensures call-site overrides survive
// exactly (Decision 2).

import React from "react";

export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement> & {
  /**
   * When true, renders the asterisk required marker in #e74c3c with
   * aria-label="required" — matching QuestionField.tsx exactly.
   */
  required?: boolean;
};

/**
 * Label primitive. Matches the `<label>` + `LABEL_STYLE` rendering in
 * QuestionField.tsx exactly (fontSize 13, color #e6edf3, fontWeight 600,
 * display block, marginBottom 6). Accepts all native label HTML attributes.
 */
export function Label({
  required,
  style,
  children,
  ...rest
}: LabelProps): React.ReactElement {
  const baseStyle: React.CSSProperties = {
    display: "block",
    fontSize: 13,
    color: "#e6edf3",
    fontWeight: 600,
    marginBottom: 6,
  };

  return (
    <label style={{ ...baseStyle, ...style }} {...rest}>
      {children}
      {required === true && (
        <span aria-label="required" style={{ color: "#e74c3c", marginLeft: 4 }}>
          *
        </span>
      )}
    </label>
  );
}

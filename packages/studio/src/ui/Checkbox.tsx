// Checkbox — standalone <input type="checkbox">.
// Replaces the standalone checkbox pattern in survey/QuestionField.tsx
// (FR-005 zero-diff). Passes through all InputHTMLAttributes.

import React from "react";

export type CheckboxProps = React.InputHTMLAttributes<HTMLInputElement>;

/** Standalone checkbox primitive. Renders <input type="checkbox"> and passes
 *  through all native InputHTMLAttributes (FR-005). No additional styling is
 *  applied beyond what the caller provides via style/className. */
export function Checkbox({
  checked,
  ...rest
}: CheckboxProps): React.ReactElement {
  return <input type="checkbox" checked={checked} {...rest} />;
}

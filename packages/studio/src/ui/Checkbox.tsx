import React from "react";
import { mergeClassNames } from "./classNames.ts";

export type CheckboxProps = React.InputHTMLAttributes<HTMLInputElement>;

/**
 * Checkbox primitive. Carries the shared `.ks-focus-ring` (index.css) so it gets
 * the same accent-ring focus indicator as every other ui/ control (#536) —
 * merged with any caller className, never replacing it. The >=44px touch target
 * is applied to the wrapping label (its natural click target, e.g. MultiSelect's
 * option row), not the 16px native box, so the compact desktop layout is kept.
 */
export function Checkbox({ className, ...rest }: CheckboxProps): React.ReactElement {
  return (
    <input
      type="checkbox"
      className={mergeClassNames("ks-focus-ring", className)}
      {...rest}
    />
  );
}

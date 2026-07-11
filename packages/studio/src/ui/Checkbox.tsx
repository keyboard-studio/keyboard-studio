import React from "react";

export type CheckboxProps = React.InputHTMLAttributes<HTMLInputElement>;

export function Checkbox(props: CheckboxProps): React.ReactElement {
  return <input type="checkbox" {...props} />;
}

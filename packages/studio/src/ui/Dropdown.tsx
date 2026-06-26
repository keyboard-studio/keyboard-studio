// Dropdown — wraps a native <select> element.
// Replaces SelectField from survey/QuestionField.tsx (FR-005 zero-diff).
// Style constants match INPUT_STYLE + { cursor: "pointer" } verbatim.

import React from "react";

export interface DropdownOption {
  value: string;
  label: string;
}

export interface DropdownProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "onChange"> {
  options: DropdownOption[];
  /** Called with the new value string on each change. */
  onChange?: (value: string) => void;
}

/** Native <select> dropdown. Renders the same element and resolved styles as
 *  SelectField in survey/QuestionField.tsx (FR-005). Callers may override style
 *  or className; the base styles below are applied first. */
export function Dropdown({
  options,
  onChange,
  style,
  ...rest
}: DropdownProps): React.ReactElement {
  const baseStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    background: "#0d1117",
    border: "1px solid #30363d",
    borderRadius: 6,
    color: "#e6edf3",
    fontSize: 14,
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    boxSizing: "border-box",
    outline: "none",
    cursor: "pointer",
  };

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>): void {
    onChange?.(e.target.value);
  }

  return (
    <select
      onChange={handleChange}
      style={{ ...baseStyle, ...style }}
      {...rest}
    >
      <option value="">— Select one —</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

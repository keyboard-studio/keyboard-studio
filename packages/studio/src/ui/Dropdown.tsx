// Dropdown — wraps a native <select> element.
// Replaces SelectField from survey/QuestionField.tsx (FR-005 zero-diff).
// Style constants match INPUT_STYLE + { cursor: "pointer" } verbatim.

import React from "react";
import {
  BG_PAGE,
  BORDER,
  TEXT_MAIN,
  FONT,
} from "./theme.ts";

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
    background: BG_PAGE,
    border: `1px solid ${BORDER}`,
    borderRadius: 6,
    color: TEXT_MAIN,
    fontSize: 14,
    fontFamily: FONT,
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

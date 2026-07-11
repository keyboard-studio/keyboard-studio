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

const BASE_STYLE: React.CSSProperties = {
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

/** Native <select> dropdown. Callers may override style or className; the base
 *  styles are applied first. */
export function Dropdown({
  options,
  onChange,
  style,
  ...rest
}: DropdownProps): React.ReactElement {
  return (
    <select
      onChange={(e) => onChange?.(e.target.value)}
      style={{ ...BASE_STYLE, ...style }}
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

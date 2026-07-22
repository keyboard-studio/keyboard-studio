import React from "react";
import {
  BG_PAGE,
  BORDER,
  TEXT_MAIN,
  FONT,
} from "./theme.ts";
import { mergeClassNames } from "./classNames.ts";

export interface DropdownOption {
  value: string;
  label: string;
}

export interface DropdownProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "onChange"> {
  options: DropdownOption[];
  /** Called with the new value string on each change. */
  onChange?: (value: string) => void;
  /**
   * Whether to render the leading blank "— Select one —" placeholder option
   * (value `""`). Default `true` to preserve existing callers' behavior.
   * Set `false` when `value` always holds a valid, defaulted selection —
   * offering the blank option in that case lets the `<select>` desync from
   * the bound value (selecting it doesn't match any known option).
   */
  includeBlank?: boolean;
}

const BASE_STYLE: React.CSSProperties = {
  width: "100%",
  padding: "0 10px",
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

/**
 * Native <select> dropdown — the one-of-a-set control (issue #536). Sized to
 * `--control-h` and carries `.ks-focus-ring`/`.ks-hit-target` (index.css) for
 * the shared focus-ring / >=44px touch-target conventions. Callers may
 * override style or className (merged, not replaced); the base styles are
 * applied first.
 */
export function Dropdown({
  options,
  onChange,
  style,
  className,
  includeBlank = true,
  ...rest
}: DropdownProps): React.ReactElement {
  return (
    <select
      onChange={(e) => onChange?.(e.target.value)}
      className={mergeClassNames("ks-control ks-focus-ring ks-hit-target", className)}
      style={{ ...BASE_STYLE, ...style }}
      {...rest}
    >
      {includeBlank && <option value="">— Select one —</option>}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

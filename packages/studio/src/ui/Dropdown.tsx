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
 * Note: native <select> popups do not open in the VS Code Simple Browser /
 * Electron webview — see `ui/SelectMenu.tsx` for a DOM-rendered alternative
 * used where that matters.
 */
export function Dropdown({
  options,
  onChange,
  style,
  className,
  ...rest
}: DropdownProps): React.ReactElement {
  return (
    <select
      onChange={(e) => onChange?.(e.target.value)}
      className={mergeClassNames("ks-control ks-focus-ring ks-hit-target", className)}
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

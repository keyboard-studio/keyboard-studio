import React from "react";
import { mergeClassNames } from "./classNames.ts";

export interface SwitchProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "onChange" | "role" | "aria-checked" | "aria-label" | "children"
> {
  /** Whether the switch is on. */
  checked: boolean;
  /** Fired with the next state when the user toggles. */
  onCheckedChange: (next: boolean) => void;
  /**
   * Accessible name and visible label, e.g. "Show keyboard".
   * Rendered as text beside the track so the control reads as one unit.
   */
  label: string;
}

const TRACK_W = 48;
const TRACK_H = 28;
const THUMB = 22;
const TRACK_PAD = 3;

/**
 * Switch (toggle) primitive. A real `<button role="switch">` so it is
 * keyboard-operable (Space/Enter) and announced correctly by screen readers;
 * carries the shared `.ks-focus-ring`. The button itself is at least
 * `var(--app-touch-target)` tall, so the whole labeled control — not just the
 * 48px track — is the coarse-pointer hit area (#1853 principle 9: the OSK
 * show/hide control must be a proper modern switch, not a text button).
 *
 * All colors come from the shared `--app-*` tokens, so the switch follows the
 * light/navy theme with zero form-factor-specific styling (principle 8).
 */
export function Switch({
  checked,
  onCheckedChange,
  label,
  className,
  style,
  disabled,
  ...rest
}: SwitchProps): React.ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={mergeClassNames("ks-focus-ring", className)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        minHeight: "var(--app-touch-target)",
        padding: "4px 8px",
        margin: 0,
        background: "none",
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        color: "var(--app-text)",
        font: "inherit",
        opacity: disabled ? 0.55 : undefined,
        ...style,
      }}
      {...rest}
    >
      <span
        aria-hidden="true"
        style={{
          width: TRACK_W,
          height: TRACK_H,
          borderRadius: 9999,
          flex: "none",
          display: "flex",
          alignItems: "center",
          padding: `0 ${TRACK_PAD}px`,
          boxSizing: "border-box",
          background: checked ? "var(--app-accent)" : "var(--app-surface-2)",
          border: "1px solid var(--app-border-strong)",
          transition: "background-color 120ms ease",
        }}
      >
        <span
          aria-hidden="true"
          className="ks-switch-thumb"
          style={{
            width: THUMB,
            height: THUMB,
            borderRadius: "50%",
            background: checked
              ? "var(--app-text-on-accent)"
              : "var(--app-surface)",
            border: checked ? "none" : "1px solid var(--app-border-strong)",
            boxSizing: "border-box",
            transform: checked
              ? `translateX(${TRACK_W - 2 * TRACK_PAD - THUMB - 2}px)`
              : "translateX(0)",
          }}
        />
      </span>
      <span>{label}</span>
    </button>
  );
}

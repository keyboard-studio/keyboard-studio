import React from "react";
import {
  BLUE_ACTION,
  BORDER,
  TEXT_DIM,
  FONT,
} from "./theme.ts";

export type ButtonVariant = "primary" | "secondary" | "back";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Visual treatment. Defaults to "secondary". */
  variant?: ButtonVariant;
};

const STYLE_PRIMARY_ENABLED: React.CSSProperties = {
  padding: "8px 18px",
  background: BLUE_ACTION,
  border: `1px solid ${BLUE_ACTION}`,
  borderRadius: 6,
  color: "#fff",
  fontSize: 13,
  cursor: "pointer",
  fontFamily: FONT,
};

const STYLE_PRIMARY_DISABLED: React.CSSProperties = {
  padding: "8px 18px",
  background: "transparent",
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  color: "#484f58",
  fontSize: 13,
  cursor: "not-allowed",
  fontFamily: FONT,
};

const STYLE_BACK: React.CSSProperties = {
  marginTop: 20,
  padding: "6px 14px",
  background: "transparent",
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  color: TEXT_DIM,
  fontSize: 13,
  cursor: "pointer",
  fontFamily: FONT,
};

export function Button({
  variant = "secondary",
  disabled = false,
  style,
  className,
  children,
  ...rest
}: ButtonProps): React.ReactElement {
  let baseStyle: React.CSSProperties;

  if (variant === "primary") {
    baseStyle = disabled ? STYLE_PRIMARY_DISABLED : STYLE_PRIMARY_ENABLED;
  } else if (variant === "back") {
    baseStyle = STYLE_BACK;
  } else {
    baseStyle = {};
  }

  return (
    <button
      type="button"
      disabled={disabled}
      className={
        className !== undefined
          ? `ks-focus-ring ks-hit-target ${className}`
          : "ks-focus-ring ks-hit-target"
      }
      style={{ ...baseStyle, ...style }}
      {...rest}
    >
      {children}
    </button>
  );
}

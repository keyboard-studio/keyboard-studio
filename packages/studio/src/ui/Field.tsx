// Field — composition wrapper: Label + control slot (children) + optional
// help/error row.
//
// Replaces the implicit field-row <div> wrappers in QuestionField.tsx,
// ScaffoldForm.tsx, and ProjectNameStep.tsx.
//
// FR-005: purely presentational. Renders the same label + gap layout as the
// inline wrappers it replaces. No color is normalized in P1. Call-site style
// pass-through on the container div ensures overrides survive (Decision 2).
//
// Field composes Label (./Label.tsx). Label is created by a sibling agent in
// this cycle; this file imports the real module unconditionally — the file is
// guaranteed present when the lead commits the cycle.

import React from "react";
import { Label } from "./Label.tsx";
import {
  TEXT_DIM,
  ERROR_TEXT,
} from "./theme.ts";

// ---------------------------------------------------------------------------
// Style constants — derived from HELP_STYLE in QuestionField.tsx and the
// error message rows in ScaffoldForm.tsx.
// ---------------------------------------------------------------------------

/** Replicates HELP_STYLE from QuestionField.tsx. */
const HELP_STYLE: React.CSSProperties = {
  fontSize: 12,
  color: TEXT_DIM,    // #8b949e
  lineHeight: 1.5,
  marginBottom: 10,
  whiteSpace: "pre-wrap",
};

/** Replicates the error text style from ScaffoldForm.tsx. */
const ERROR_STYLE: React.CSSProperties = {
  fontSize: 12,
  color: ERROR_TEXT,  // #f0a0a0
  lineHeight: 1.4,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FieldProps {
  /**
   * The label text or node. If a string is passed, Field renders a <Label>
   * with htmlFor wired to the fieldId. If a ReactNode is passed, it is used
   * verbatim as the label content.
   */
  label?: React.ReactNode;

  /**
   * The id that links the label's `htmlFor` to the control. Pass the same
   * value as the control's `id` prop.
   */
  fieldId?: string;

  /** When true, adds the required marker to the label (via Label's required prop). */
  required?: boolean;

  /**
   * Optional help text rendered below the label and above the control.
   * Matches HELP_STYLE from QuestionField.tsx.
   */
  help?: React.ReactNode;

  /**
   * Optional error text rendered below the control in ERROR_TEXT color.
   * When provided the error node is given role="alert" so screen readers
   * announce it immediately (live-region pattern from ScaffoldForm).
   */
  error?: React.ReactNode;

  /**
   * The controlled input or group. Rendered between the help text and the
   * error text, in the same slot as the inline controls in QuestionField.
   */
  children?: React.ReactNode;

  /**
   * Additional style applied to the outer container div.
   * Merges over the default flex-column layout.
   */
  style?: React.CSSProperties;

  /**
   * Additional className applied to the outer container div.
   */
  className?: string;
}

/**
 * Presentational field-row wrapper.
 *
 * Renders: Label → help text → children (control slot) → error text.
 *
 * Matches the `<div style={{ display:"flex", flexDirection:"column", gap:4 }}`
 * wrappers used throughout QuestionField.tsx and ScaffoldForm.tsx.
 *
 * FR-004: no global state, context, or imports from survey/steps/stores.
 */
export function Field({
  label,
  fieldId,
  required = false,
  help,
  error,
  children,
  style,
  className,
}: FieldProps): React.ReactElement {
  const containerStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    ...style,
  };

  return (
    <div style={containerStyle} className={className}>
      {label !== undefined && (
        typeof label === "string" ? (
          <Label htmlFor={fieldId} required={required}>
            {label}
          </Label>
        ) : (
          label
        )
      )}

      {help !== undefined && (
        <p style={HELP_STYLE}>{help}</p>
      )}

      {children}

      {error !== undefined && (
        <div role="alert" style={ERROR_STYLE}>
          {error}
        </div>
      )}
    </div>
  );
}

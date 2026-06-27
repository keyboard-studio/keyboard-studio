// MultiSelect — checkbox-row group.
// Replaces MultiSelectField from survey/QuestionField.tsx (FR-005 zero-diff).
// Accent color #6ea8fe and row styles match MultiSelectField verbatim.

import React from "react";

export interface MultiSelectOption {
  value: string;
  label: string;
}

export interface MultiSelectProps {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  /**
   * Prefix used when generating checkbox input ids.
   * Each checkbox id is `${idPrefix}${opt.value}`.
   * Default is `"multiselect-"` — preserves the original behavior.
   * Pass `"${questionId}-"` to match the QuestionField id convention.
   */
  idPrefix?: string;
  /**
   * Value for `aria-labelledby` on the `<div role="group">` wrapper.
   * Required for screen readers when the group label is a sibling element
   * (e.g. `<span id="label-{id}">`) rather than a wrapping `<fieldset>`.
   * Omitting it preserves current behavior (no aria-labelledby attribute).
   */
  ariaLabelledby?: string;
}

const OPTION_ROW_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
  marginBottom: 8,
  cursor: "pointer",
};

const OPTION_LABEL_STYLE: React.CSSProperties = {
  fontSize: 13,
  color: "#e6edf3",
  lineHeight: 1.5,
  cursor: "pointer",
};

/** Checkbox-row group. Renders role="group" identical to MultiSelectField
 *  (FR-005). accentColor #6ea8fe is preserved verbatim. */
export function MultiSelect({
  options,
  selected,
  onChange,
  idPrefix = "multiselect-",
  ariaLabelledby,
}: MultiSelectProps): React.ReactElement {
  function toggle(optValue: string): void {
    const next = selected.includes(optValue)
      ? selected.filter((v) => v !== optValue)
      : [...selected, optValue];
    onChange(next);
  }

  return (
    <div role="group" aria-labelledby={ariaLabelledby}>
      {options.map((opt) => {
        const checked = selected.includes(opt.value);
        const inputId = `${idPrefix}${opt.value}`;
        return (
          <label key={opt.value} htmlFor={inputId} style={OPTION_ROW_STYLE}>
            <input
              type="checkbox"
              id={inputId}
              checked={checked}
              onChange={() => toggle(opt.value)}
              style={{ marginTop: 2, flexShrink: 0, accentColor: "#6ea8fe" }}
            />
            <span style={OPTION_LABEL_STYLE}>{opt.label}</span>
          </label>
        );
      })}
    </div>
  );
}

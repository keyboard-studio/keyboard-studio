import React from "react";
import { TEXT_MAIN, ACCENT } from "./theme.ts";

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
  color: TEXT_MAIN,
  lineHeight: 1.5,
  cursor: "pointer",
};

const CHECKBOX_STYLE: React.CSSProperties = {
  marginTop: 2,
  flexShrink: 0,
  accentColor: ACCENT,
};

/** Checkbox-row group. */
export function MultiSelect({
  options,
  selected,
  onChange,
  idPrefix = "multiselect-",
  ariaLabelledby,
}: MultiSelectProps): React.ReactElement {
  const toggle = (optValue: string): void => {
    const next = selected.includes(optValue)
      ? selected.filter((v) => v !== optValue)
      : [...selected, optValue];
    onChange(next);
  };

  return (
    <div role="group" aria-labelledby={ariaLabelledby}>
      {options.map((opt) => {
        const inputId = `${idPrefix}${opt.value}`;
        return (
          <label key={opt.value} htmlFor={inputId} style={OPTION_ROW_STYLE}>
            <input
              type="checkbox"
              id={inputId}
              checked={selected.includes(opt.value)}
              onChange={() => toggle(opt.value)}
              style={CHECKBOX_STYLE}
            />
            <span style={OPTION_LABEL_STYLE}>{opt.label}</span>
          </label>
        );
      })}
    </div>
  );
}

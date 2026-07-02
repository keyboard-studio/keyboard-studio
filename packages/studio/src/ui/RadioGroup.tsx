// RadioGroup — renders a <div role="radiogroup"> with radio inputs.
// Replaces RadioField (mode="list") and BoolField (mode="bool") from
// survey/QuestionField.tsx (FR-005 zero-diff).
//
// Accent colors preserved verbatim:
//   list mode: #6ea8fe  (RadioField accentColor)
//   bool mode: #3fb950  (BoolField accentColor)

import React from "react";
import {
  TEXT_MAIN,
  TEXT_DIM,
  ACCENT,
} from "./theme.ts";

export interface RadioOption {
  value: string;
  label: string;
  note?: string;
}

export interface RadioGroupProps {
  /** "list" renders arbitrary options; "bool" synthesizes yes/no pair. Default: "list". */
  mode?: "list" | "bool";
  /** Used as the HTML name attribute and to generate unique input ids. */
  name: string;
  /** Currently selected value, or null for no selection. */
  value: string | null;
  /** Options for list mode. Ignored in bool mode (yes/no are synthesized). */
  options: RadioOption[];
  /** Override accent color. Defaults are mode-driven (#6ea8fe list / #3fb950 bool). */
  accent?: string;
  onChange: (value: string) => void;
  /**
   * Value for `aria-labelledby` on the `<div role="radiogroup">` wrapper.
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

const NOTE_STYLE: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  color: TEXT_DIM,
  marginTop: 2,
};

/** list-mode accent — matches RadioField verbatim */
const LIST_ACCENT = ACCENT;
/** bool-mode accent — matches BoolField verbatim */
const BOOL_ACCENT = "#3fb950";

interface RadioItemProps {
  inputId: string;
  name: string;
  optValue: string;
  label: string;
  note?: string | undefined;
  checked: boolean;
  accentColor: string;
  onChange: (v: string) => void;
  required?: boolean | undefined;
}

function RadioItem({
  inputId,
  name,
  optValue,
  label,
  note,
  checked,
  accentColor,
  onChange,
  required,
}: RadioItemProps): React.ReactElement {
  return (
    <label htmlFor={inputId} style={OPTION_ROW_STYLE}>
      <input
        type="radio"
        id={inputId}
        name={name}
        value={optValue}
        checked={checked}
        onChange={() => onChange(optValue)}
        style={{ marginTop: 2, flexShrink: 0, accentColor }}
        aria-required={required}
        // E2E hook: the live "adapt" option of the track_choice question
        // (packages/studio/src/survey/questions/g/track_choice.ts) is the
        // only wizard-critical radio target Playwright needs a stable,
        // text-independent selector for. Keyed on the generated inputId
        // (`${name}-${optValue}`) so this stays a single-option opt-in,
        // not a blanket testid on every RadioGroup instance.
        {...(inputId === "track_choice-adapt" ? { "data-testid": "track-adapt" } : {})}
      />
      <span style={OPTION_LABEL_STYLE}>
        {label}
        {note !== undefined && <span style={NOTE_STYLE}>{note}</span>}
      </span>
    </label>
  );
}

/** Radio group primitive. Renders role="radiogroup" identical to RadioField /
 *  BoolField (FR-005). Bool mode synthesizes yes/no options with the green
 *  accent #3fb950; list mode uses #6ea8fe. */
export function RadioGroup({
  mode = "list",
  name,
  value,
  options,
  accent,
  onChange,
  ariaLabelledby,
}: RadioGroupProps): React.ReactElement {
  const resolvedAccent =
    accent ?? (mode === "bool" ? BOOL_ACCENT : LIST_ACCENT);

  if (mode === "bool") {
    const yesId = `${name}-yes`;
    const noId = `${name}-no`;
    return (
      <div role="radiogroup" aria-labelledby={ariaLabelledby}>
        <RadioItem
          inputId={yesId}
          name={name}
          optValue="true"
          label="Yes"
          checked={value === "true"}
          accentColor={resolvedAccent}
          onChange={onChange}
        />
        <RadioItem
          inputId={noId}
          name={name}
          optValue="false"
          label="No"
          checked={value === "false"}
          accentColor={resolvedAccent}
          onChange={onChange}
        />
      </div>
    );
  }

  return (
    <div role="radiogroup" aria-labelledby={ariaLabelledby}>
      {options.map((opt) => {
        const inputId = `${name}-${opt.value}`;
        return (
          <RadioItem
            key={opt.value}
            inputId={inputId}
            name={name}
            optValue={opt.value}
            label={opt.label}
            {...(opt.note !== undefined ? { note: opt.note } : {})}
            checked={value === opt.value}
            accentColor={resolvedAccent}
            onChange={onChange}
          />
        );
      })}
    </div>
  );
}

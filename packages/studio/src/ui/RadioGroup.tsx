// RadioGroup — renders a <div role="radiogroup"> with radio inputs.
// Replaces RadioField (mode="list") and BoolField (mode="bool") from
// survey/QuestionField.tsx (FR-005 zero-diff).
//
// Accent colors (epic #533 — theme.ts constants are `var(--app-*)` tokens):
//   list mode: ACCENT (var(--app-accent))       — was raw hex #6ea8fe
//   bool mode: var(--app-success)               — was raw hex #3fb950
//   (#3fb950 is the navy theme's own --app-success value, so this is a
//   like-for-like token swap, not a new color choice.)

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
  /** Disables this option's input (e.g. shift-layer targeting on a mnemonic keyboard). */
  disabled?: boolean;
  /** Tooltip shown on the input — typically explains why `disabled` is set. */
  title?: string;
  /**
   * Rich content rendered inside the option's label, below `label`/`note`.
   *
   * For evidence the reader needs AT THE POINT OF CHOOSING rather than one
   * click away — e.g. spec 044's exemplar offer, which shows the proposed
   * alphabet's source, size and a character preview on the option itself.
   * Prefer `note` for plain secondary text; reach for this only when the
   * content needs markup.
   */
  detail?: React.ReactNode;
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
  /** Override accent color. Defaults are mode-driven (ACCENT list / var(--app-success) bool). */
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

// Issue #536: the label wraps the radio + its text, so it is the natural hit
// target — bumping it (not the 16px native radio) to >=44px on coarse
// pointers keeps the compact desktop layout while satisfying touch a11y.
const OPTION_ROW_CLASSNAME = "ks-hit-target";

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
/** bool-mode accent — matches BoolField's navy-theme value, now token-backed */
const BOOL_ACCENT = "var(--app-success)";

interface RadioItemProps {
  inputId: string;
  name: string;
  optValue: string;
  label: string;
  note?: string | undefined;
  checked: boolean;
  accentColor: string;
  onChange: (v: string) => void;
  disabled?: boolean | undefined;
  title?: string | undefined;
  detail?: React.ReactNode | undefined;
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
  disabled,
  title,
  detail,
}: RadioItemProps): React.ReactElement {
  return (
    <label htmlFor={inputId} style={OPTION_ROW_STYLE} className={OPTION_ROW_CLASSNAME}>
      <input
        type="radio"
        id={inputId}
        name={name}
        value={optValue}
        checked={checked}
        onChange={() => onChange(optValue)}
        disabled={disabled}
        title={title}
        className="ks-focus-ring"
        style={{ marginTop: 2, flexShrink: 0, accentColor }}
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
        {detail}
      </span>
    </label>
  );
}

/** Radio group primitive. Renders role="radiogroup" identical to RadioField /
 *  BoolField (FR-005). Bool mode synthesizes yes/no options with the
 *  success-green accent (var(--app-success)); list mode uses the accent
 *  token (var(--app-accent)). */
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
            note={opt.note}
            checked={value === opt.value}
            accentColor={resolvedAccent}
            onChange={onChange}
            disabled={opt.disabled}
            title={opt.title}
            detail={opt.detail}
          />
        );
      })}
    </div>
  );
}

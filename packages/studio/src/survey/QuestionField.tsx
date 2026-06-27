// Per-type question field renderers, dispatched by SurveyRunner.
// Each renderer receives the current value (string | string[] | undefined)
// and calls onChange when the user modifies it.

import type { FlowQuestion } from "./types.ts";
import type { LintFinding } from "@keyboard-studio/contracts";
import { LintChip } from "../lint/LintChip.tsx";
import {
  TextField,
  Textarea,
  Dropdown,
  RadioGroup,
  Notice,
  Label,
  Autocomplete,
  MultiSelect,
} from "../ui/index.ts";
import type { DropdownOption } from "../ui/Dropdown.tsx";
import type { RadioOption } from "../ui/RadioGroup.tsx";
import type { MultiSelectOption } from "../ui/MultiSelect.tsx";

// ---------------------------------------------------------------------------
// Style constants retained for elements the ui/ primitives cannot cover
// (documented one-offs below).
// ---------------------------------------------------------------------------

// one-off: HELP_STYLE — Field.tsx exposes a help slot but restructuring the
// outer container to use Field would conflict with the grouped-label <span>
// pattern; kept inline to preserve zero diff.
const HELP_STYLE: React.CSSProperties = {
  fontSize: 12,
  color: "#8b949e",
  lineHeight: 1.5,
  marginBottom: 10,
  whiteSpace: "pre-wrap",
};


interface FieldProps {
  question: FlowQuestion;
  value: string | string[] | undefined;
  onChange: (v: string | string[]) => void;
}

function stringValue(v: string | string[] | undefined): string {
  return typeof v === "string" ? v : "";
}

function arrayValue(v: string | string[] | undefined): string[] {
  return Array.isArray(v) ? v : [];
}

// ---------------------------------------------------------------------------
// Text / short_text  →  ui TextField / Textarea
// ---------------------------------------------------------------------------

function TextFieldControl({ question, value, onChange }: FieldProps) {
  const isMultiLine = question.type === "text";
  const strVal = stringValue(value);
  if (isMultiLine) {
    return (
      <Textarea
        id={question.id}
        aria-required={question.required === true}
        value={strVal}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
      />
    );
  }
  return (
    <TextField
      id={question.id}
      aria-required={question.required === true}
      value={strVal}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

// ---------------------------------------------------------------------------
// Autocomplete (text + datalist)  →  ui Autocomplete (object-form options)
// ---------------------------------------------------------------------------

function AutocompleteField({ question, value, onChange }: FieldProps) {
  const strVal = stringValue(value);
  const acOptions = (question.options ?? []).map((opt) => ({
    value: opt.value,
    label: opt.label,
  }));
  return (
    <Autocomplete
      id={question.id}
      aria-required={question.required === true}
      value={strVal}
      onChange={(e) => onChange(e.target.value)}
      options={acOptions}
    />
  );
}

// ---------------------------------------------------------------------------
// Select (native <select>)  →  ui Dropdown
// ---------------------------------------------------------------------------

function SelectField({ question, value, onChange }: FieldProps) {
  const strVal = stringValue(value);
  const dropdownOptions: DropdownOption[] = (question.options ?? []).map(
    (opt) => ({ value: opt.value, label: opt.label }),
  );
  return (
    <Dropdown
      id={question.id}
      aria-required={question.required === true}
      value={strVal}
      options={dropdownOptions}
      onChange={(v) => onChange(v)}
    />
  );
}

// ---------------------------------------------------------------------------
// Radio group  →  ui RadioGroup (mode="list")
// ---------------------------------------------------------------------------

function RadioField({ question, value, onChange }: FieldProps) {
  const strVal = stringValue(value);
  const radioOptions: RadioOption[] = (question.options ?? []).map((opt) => ({
    value: opt.value,
    label: opt.label,
    ...(opt.note !== undefined ? { note: opt.note } : {}),
  }));
  return (
    <RadioGroup
      mode="list"
      name={question.id}
      value={strVal === "" ? null : strVal}
      options={radioOptions}
      onChange={(v) => onChange(v)}
      ariaLabelledby={`label-${question.id}`}
    />
  );
}

// ---------------------------------------------------------------------------
// Boolean (Yes / No radio pair)  →  ui RadioGroup (mode="bool")
// ---------------------------------------------------------------------------

function BoolField({ question, value, onChange }: FieldProps) {
  const strVal = stringValue(value);
  return (
    <RadioGroup
      mode="bool"
      name={question.id}
      value={strVal === "" ? null : strVal}
      options={[]}
      onChange={(v) => onChange(v)}
      ariaLabelledby={`label-${question.id}`}
    />
  );
}

// ---------------------------------------------------------------------------
// Multi-select (checkboxes)  →  ui MultiSelect
// ---------------------------------------------------------------------------

function MultiSelectField({ question, value, onChange }: FieldProps) {
  const arrVal = arrayValue(value);
  const options = question.options ?? [];

  if (options.length === 0 && question.options_source !== undefined) {
    return (
      <p style={{ fontSize: 13, color: "#8b949e", fontStyle: "italic" }}>
        Dynamic options ({question.options_source}) not loaded in this build.
      </p>
    );
  }

  const msOptions: MultiSelectOption[] = options.map((opt) => ({
    value: opt.value,
    label: opt.label,
  }));

  return (
    <MultiSelect
      options={msOptions}
      selected={arrVal}
      onChange={(next) => onChange(next)}
      idPrefix={`${question.id}-`}
      ariaLabelledby={`label-${question.id}`}
    />
  );
}

// ---------------------------------------------------------------------------
// Notice (read-only; no input)  →  ui Notice
// ---------------------------------------------------------------------------

function NoticeField({ question }: Pick<FieldProps, "question">) {
  return (
    <Notice>
      {question.body ?? question.help_text ?? question.prompt}
    </Notice>
  );
}

// ---------------------------------------------------------------------------
// Public dispatcher
// ---------------------------------------------------------------------------

export interface QuestionFieldProps {
  question: FlowQuestion;
  value: string | string[] | undefined;
  onChange: (v: string | string[]) => void;
  findingsByQuestionId?: Record<string, LintFinding[]>;
}

export function QuestionField({
  question,
  value,
  onChange,
  findingsByQuestionId,
}: QuestionFieldProps) {
  // Findings are associated to questions by id via a caller-supplied map.
  // LintFinding has no questionId field by design (see contracts/lintFinding.ts);
  // the survey<->lint bridge owns the mapping.
  const relevant = findingsByQuestionId?.[question.id] ?? [];

  const labelText = question.prompt ?? question.label ?? question.id;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {question.type !== "notice" && (() => {
        const isGrouped = question.type === "radio" || question.type === "bool" || question.type === "multi_select";
        // Grouped fields (radio/bool/multi_select) use Label as="span" so the
        // element is a <span> (not <label>), valid as a sibling of role="radiogroup"
        // / role="group". The id is required so aria-labelledby resolves.
        return isGrouped ? (
          <Label
            as="span"
            id={`label-${question.id}`}
            required={question.required === true}
          >
            {labelText}
          </Label>
        ) : (
          <Label id={`label-${question.id}`} htmlFor={question.id} required={question.required === true}>
            {labelText}
          </Label>
        );
      })()}

      {question.help_text !== undefined && question.type !== "notice" && (
        <p style={HELP_STYLE}>{question.help_text}</p>
      )}

      {question.type === "text" || question.type === "short_text" ? (
        <TextFieldControl question={question} value={value} onChange={onChange} />
      ) : question.type === "autocomplete" ? (
        <AutocompleteField question={question} value={value} onChange={onChange} />
      ) : question.type === "select" ? (
        <SelectField question={question} value={value} onChange={onChange} />
      ) : question.type === "radio" ? (
        <RadioField question={question} value={value} onChange={onChange} />
      ) : question.type === "bool" ? (
        <BoolField question={question} value={value} onChange={onChange} />
      ) : question.type === "multi_select" ? (
        <MultiSelectField question={question} value={value} onChange={onChange} />
      ) : question.type === "notice" ? (
        <NoticeField question={question} />
      ) : null}

      {relevant.length > 0 && (
        <div
          aria-live="polite"
          style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}
        >
          {relevant.map((f, i) => (
            <LintChip key={`${f.code}-${i}`} finding={f} />
          ))}
        </div>
      )}
    </div>
  );
}

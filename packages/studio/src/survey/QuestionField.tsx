// Per-type question field renderers, dispatched by SurveyRunner.
// Each renderer receives the current value (string | string[] | undefined)
// and calls onChange when the user modifies it.

import type { FlowQuestion } from "./types.ts";
import type { LintFinding } from "@keyboard-studio/contracts";
import { LintChip } from "../lint/LintChip.tsx";

const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  background: "#0d1117",
  border: "1px solid #30363d",
  borderRadius: 6,
  color: "#e6edf3",
  fontSize: 14,
  fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  boxSizing: "border-box",
  outline: "none",
};

const LABEL_STYLE: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  color: "#e6edf3",
  fontWeight: 600,
  marginBottom: 6,
};

const HELP_STYLE: React.CSSProperties = {
  fontSize: 12,
  color: "#8b949e",
  lineHeight: 1.5,
  marginBottom: 10,
  whiteSpace: "pre-wrap",
};

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
// Text / short_text
// ---------------------------------------------------------------------------

function TextField({ question, value, onChange }: FieldProps) {
  const isMultiLine = question.type === "text";
  const strVal = stringValue(value);
  if (isMultiLine) {
    return (
      <textarea
        id={question.id}
        aria-required={question.required === true}
        value={strVal}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        style={{ ...INPUT_STYLE, resize: "vertical" }}
      />
    );
  }
  return (
    <input
      type="text"
      id={question.id}
      aria-required={question.required === true}
      value={strVal}
      onChange={(e) => onChange(e.target.value)}
      style={INPUT_STYLE}
    />
  );
}

// ---------------------------------------------------------------------------
// Autocomplete (text + datalist)
// ---------------------------------------------------------------------------

function AutocompleteField({ question, value, onChange }: FieldProps) {
  const listId = `datalist-${question.id}`;
  const strVal = stringValue(value);
  return (
    <>
      <input
        type="text"
        id={question.id}
        list={listId}
        aria-required={question.required === true}
        value={strVal}
        onChange={(e) => onChange(e.target.value)}
        style={INPUT_STYLE}
        autoComplete="off"
      />
      <datalist id={listId}>
        {(question.options ?? []).map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </datalist>
    </>
  );
}

// ---------------------------------------------------------------------------
// Select (native <select>)
// ---------------------------------------------------------------------------

function SelectField({ question, value, onChange }: FieldProps) {
  const strVal = stringValue(value);
  return (
    <select
      id={question.id}
      aria-required={question.required === true}
      value={strVal}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...INPUT_STYLE, cursor: "pointer" }}
    >
      <option value="">— Select one —</option>
      {(question.options ?? []).map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------------------
// Radio group
// ---------------------------------------------------------------------------

function RadioField({ question, value, onChange }: FieldProps) {
  const strVal = stringValue(value);
  return (
    <div role="radiogroup" aria-labelledby={`label-${question.id}`}>
      {(question.options ?? []).map((opt) => {
        const inputId = `${question.id}-${opt.value}`;
        const checked = strVal === opt.value;
        return (
          <label key={opt.value} htmlFor={inputId} style={OPTION_ROW_STYLE}>
            <input
              type="radio"
              id={inputId}
              name={question.id}
              value={opt.value}
              checked={checked}
              onChange={() => onChange(opt.value)}
              style={{ marginTop: 2, flexShrink: 0, accentColor: "#6ea8fe" }}
              aria-required={question.required === true}
            />
            <span style={OPTION_LABEL_STYLE}>
              {opt.label}
              {opt.note !== undefined && (
                <span
                  style={{
                    display: "block",
                    fontSize: 11,
                    color: "#8b949e",
                    marginTop: 2,
                  }}
                >
                  {opt.note}
                </span>
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Boolean (Yes / No radio pair)
// ---------------------------------------------------------------------------

function BoolField({ question, value, onChange }: FieldProps) {
  const strVal = stringValue(value);
  const yesId = `${question.id}-yes`;
  const noId = `${question.id}-no`;
  return (
    <div role="radiogroup" aria-labelledby={`label-${question.id}`}>
      <label htmlFor={yesId} style={OPTION_ROW_STYLE}>
        <input
          type="radio"
          id={yesId}
          name={question.id}
          value="true"
          checked={strVal === "true"}
          onChange={() => onChange("true")}
          style={{ marginTop: 2, accentColor: "#3fb950" }}
        />
        <span style={OPTION_LABEL_STYLE}>Yes</span>
      </label>
      <label htmlFor={noId} style={OPTION_ROW_STYLE}>
        <input
          type="radio"
          id={noId}
          name={question.id}
          value="false"
          checked={strVal === "false"}
          onChange={() => onChange("false")}
          style={{ marginTop: 2, accentColor: "#3fb950" }}
        />
        <span style={OPTION_LABEL_STYLE}>No</span>
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Multi-select (checkboxes)
// ---------------------------------------------------------------------------

function MultiSelectField({ question, value, onChange }: FieldProps) {
  const arrVal = arrayValue(value);

  function toggle(optValue: string) {
    const next = arrVal.includes(optValue)
      ? arrVal.filter((v) => v !== optValue)
      : [...arrVal, optValue];
    onChange(next);
  }

  const options = question.options ?? [];

  if (options.length === 0 && question.options_source !== undefined) {
    return (
      <p style={{ fontSize: 13, color: "#8b949e", fontStyle: "italic" }}>
        Dynamic options ({question.options_source}) not loaded in this build.
      </p>
    );
  }

  return (
    <div role="group" aria-labelledby={`label-${question.id}`}>
      {options.map((opt) => {
        const inputId = `${question.id}-${opt.value}`;
        const checked = arrVal.includes(opt.value);
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

// ---------------------------------------------------------------------------
// Notice (read-only; no input)
// ---------------------------------------------------------------------------

function NoticeField({ question }: Pick<FieldProps, "question">) {
  return (
    <div
      style={{
        padding: "14px 16px",
        background: "#161b22",
        border: "1px solid #30363d",
        borderRadius: 8,
        fontSize: 13,
        color: "#8b949e",
        lineHeight: 1.6,
        whiteSpace: "pre-wrap",
      }}
    >
      {question.body ?? question.help_text ?? question.prompt}
    </div>
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
        const labelContent = (
          <>
            {labelText}
            {question.required === true && (
              <span aria-label="required" style={{ color: "#e74c3c", marginLeft: 4 }}>
                *
              </span>
            )}
          </>
        );
        return isGrouped ? (
          <span id={`label-${question.id}`} style={LABEL_STYLE}>{labelContent}</span>
        ) : (
          <label id={`label-${question.id}`} htmlFor={question.id} style={LABEL_STYLE}>{labelContent}</label>
        );
      })()}

      {question.help_text !== undefined && question.type !== "notice" && (
        <p style={HELP_STYLE}>{question.help_text}</p>
      )}

      {question.type === "text" || question.type === "short_text" ? (
        <TextField question={question} value={value} onChange={onChange} />
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

// Per-type question field renderers, dispatched by SurveyRunner.
// Each renderer receives the current value (string | string[] | undefined)
// and calls onChange when the user modifies it.

import { useState, useEffect, useRef } from "react";
import type { FlowQuestion } from "./types.ts";
import type { LintFinding, LanguageSummary } from "@keyboard-studio/contracts";
import { LintChip } from "../lint/LintChip.tsx";
import { loadLangtags } from "../lib/langtagsDefaults.ts";
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

  // When options_source is "@langtags_iso639", delegate to the langtags-backed
  // picker. The static options array is the fallback when options_source is
  // absent or a different source.
  if (question.options_source === "@langtags_iso639") {
    return (
      <LangtagsAutocompleteField
        question={question}
        value={value}
        onChange={onChange}
      />
    );
  }

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
// LangtagsAutocompleteField — langtags-backed searchable language picker.
//
// The langtags module is loaded lazily (one-time async on first render) and
// the datalist is populated from the search results. The Autocomplete primitive
// uses a native <input list> which always accepts free text, satisfying FR-009
// (a typed value not in the list is passed directly to onChange).
//
// No per-keystroke debounce is added here — this is NOT the 300 ms validator
// cycle (decision D3). The search runs on the already-loaded in-memory index
// (synchronous after the one-time import resolves), so it is instantaneous.
// ---------------------------------------------------------------------------

function LangtagsAutocompleteField({ question, value, onChange }: FieldProps) {
  const strVal = stringValue(value);
  const [options, setOptions] = useState<LanguageSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const loadedRef = useRef(false);
  // Unmount guard: prevents setOptions from running after the component unmounts,
  // which would produce a React "state update on unmounted component" warning.
  const isMountedRef = useRef(true);

  // One-time lazy load of the langtags module on mount. The module promise is
  // memoized in langtagsDefaults.ts so repeated renders share the same import.
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    loadLangtags()
      .then((mod) => {
        // Pre-populate with the full list so the datalist is available immediately
        // before the user starts typing. listLanguages() returns a readonly array
        // from the already-loaded module (synchronous after the import resolves).
        if (!isMountedRef.current) return;
        const all = mod.listLanguages();
        setOptions(all as LanguageSummary[]);
        setLoaded(true);
      })
      .catch(() => {
        // If the module fails to load, the field degrades to a plain text input.
        if (!isMountedRef.current) return;
        setLoaded(true);
      });
  }, []);

  // Update the datalist dynamically as the user types. The lookupByName search
  // runs synchronously against the in-memory index (no network, no async). When
  // the query is empty we show the full list (listLanguages) so browsing works.
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const typed = e.target.value;
    onChange(typed);
    if (loaded) {
      loadLangtags()
        .then((mod) => {
          if (!isMountedRef.current) return;
          const results = typed
            ? mod.lookupByName(typed)
            : mod.listLanguages();
          setOptions(results as LanguageSummary[]);
        })
        .catch(() => {
          // Silently ignore — module is loaded (we got here from the mount effect).
        });
    }
  }

  // Build datalist options: label = "EnglishName (code)" + autonym if present.
  // The datalist value is the language code (what gets written to the answer),
  // and the label is the human-readable string shown in the suggestion dropdown.
  const acOptions = options.map((lang) => {
    const autonymSuffix =
      lang.autonym !== undefined && lang.autonym !== lang.englishName
        ? ` / ${lang.autonym}`
        : "";
    return {
      value: lang.code,
      label: `${lang.englishName} (${lang.code})${autonymSuffix}`,
    };
  });

  // aria-label is omitted here: the input's `id` matches the `<Label htmlFor={question.id}>`
  // rendered by QuestionField, so the accessible name comes from the associated <label>
  // element — consistent with all sibling field renderers (TextFieldControl, SelectField, etc.).
  return (
    <Autocomplete
      id={question.id}
      aria-required={question.required === true}
      placeholder={loaded ? "Search by name, autonym, or code..." : "Loading languages..."}
      value={strVal}
      onChange={handleChange}
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

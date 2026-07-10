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
import { helpText, TEXT_DIM } from "./surveyStyles.ts";


interface FieldProps {
  question: FlowQuestion;
  value: string | string[] | undefined;
  onChange: (v: string | string[]) => void;
  /**
   * Side-channel used only by the langtags name-picker (`@langtags_names`).
   * Reports which concrete langtags entry the author selected — or `null` when
   * the field holds unresolved free text — so the survey can seed the downstream
   * autonym / code / script fields and decide region disambiguation. The answer
   * value itself stays the English NAME; this channel carries the resolved
   * identity that a name string alone cannot (homonyms, spec 030 US1/US3).
   */
  onEntryResolved?: (entry: LanguageSummary | null) => void;
  /**
   * Called when the author picks a concrete option from a dropdown/combobox
   * field (not on free-text typing). The survey uses this to auto-advance to the
   * next question. The argument is the selected option's value. Only the styled
   * combobox fields (Q1 name picker, Q2/region options) call it.
   */
  onSelectAdvance?: (value: string) => void;
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

function AutocompleteField({ question, value, onChange, onEntryResolved, onSelectAdvance }: FieldProps) {
  // `@langtags_names` (spec 030 US1): the English-name-first picker. It shows
  // the language NAME in the field and reports the resolved entry via
  // onEntryResolved so homonyms (same name, different code) can be told apart.
  if (question.options_source === "@langtags_names") {
    return (
      <LangtagsNamePickerField
        question={question}
        value={value}
        onChange={onChange}
        {...(onEntryResolved !== undefined ? { onEntryResolved } : {})}
        {...(onSelectAdvance !== undefined ? { onSelectAdvance } : {})}
      />
    );
  }

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

  // Generic options autocomplete (e.g. il_language_autonym Q2, il_language_region):
  // the SAME styled dropdown as the Q1 langtags name picker, driven by the
  // question's options (static or getSeedOptions-injected) instead of a langtags
  // search — so all three dropdowns look identical. Free text is always accepted
  // (FR-009).
  return (
    <StyledOptionsField
      question={question}
      value={value}
      onChange={onChange}
      {...(onSelectAdvance !== undefined ? { onSelectAdvance } : {})}
    />
  );
}

// ---------------------------------------------------------------------------
// StyledOptionsField — generic options autocomplete for Q2 (il_language_autonym)
// and the region step. The choice list is the question's own `options`, which
// SurveyRunner overrides per-render with getSeedOptions output (spec 030 US2:
// the resolved entry's own-script names, or English/alternate names as the
// fallback). It renders the SAME StyledCombobox as the Q1 langtags name picker
// so all three dropdowns look identical; free text is always accepted (FR-009),
// and picking a row writes that option's value.
// ---------------------------------------------------------------------------

function StyledOptionsField({ question, value, onChange, onSelectAdvance }: FieldProps) {
  const typed = stringValue(value);
  const allOptions: ComboOption[] = (question.options ?? []).map((opt) => ({
    value: opt.value,
    label: opt.label,
  }));

  // Native-datalist-style filtering so the styled list still narrows as the
  // author types: an empty value — or one that exactly matches a chosen option —
  // shows every option; a partial value filters by label/value substring.
  const q = typed.trim().toLowerCase();
  const exact = allOptions.some((o) => o.value === typed);
  const shown =
    q === "" || exact
      ? allOptions
      : allOptions.filter(
          (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
        );

  return (
    <StyledCombobox
      id={question.id}
      value={typed}
      options={shown}
      required={question.required === true}
      onType={(text) => onChange(text)}
      onSelect={(opt) => {
        onChange(opt.value);
        onSelectAdvance?.(opt.value);
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// LangtagsNamePickerField — the English-name-first language picker (spec 030
// US1). Unlike the code-valued datalist picker, this field holds the English
// NAME as its value and reports the resolved langtags entry via onEntryResolved
// so homonyms (same English name, different code) are told apart at selection.
// It uses the custom StyledCombobox (not a native datalist) because a datalist
// cannot distinguish two rows that share a display string, and cannot carry the
// resolved LanguageSummary payload a homonym pick needs.
//
// Resolution rules:
//   - selecting a row → onChange(englishName) + onEntryResolved(summary);
//   - typing a name that uniquely matches one entry's English name → resolve it;
//   - typing an ambiguous name (>1 exact English-name match) → onEntryResolved(null);
//   - free text that matches nothing → onChange(text) + onEntryResolved(null).
// ---------------------------------------------------------------------------

/** Build the dropdown label for a language summary: English name (+ autonym,
 *  + region when present) followed by the code, so homonyms are visually
 *  disambiguated by region/code. */
function nameOptionLabel(summary: LanguageSummary): string {
  const base = summary.englishName ?? summary.code;
  const autonym =
    summary.autonym !== undefined && summary.autonym !== summary.englishName
      ? ` / ${summary.autonym}`
      : "";
  const region = summary.regionName !== undefined ? ` — ${summary.regionName}` : "";
  return `${base}${autonym}${region} (${summary.code})`;
}

function LangtagsNamePickerField({ question, value, onChange, onEntryResolved, onSelectAdvance }: FieldProps) {
  const strVal = stringValue(value);
  const [options, setOptions] = useState<LanguageSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Loaded langtags module, held so onType/onOpen can query it synchronously
  // (the in-memory index resolves once; no per-keystroke async — decision D3).
  const modRef = useRef<Awaited<ReturnType<typeof loadLangtags>> | null>(null);
  const loadedRef = useRef(false);
  const isMountedRef = useRef(true);

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
        if (!isMountedRef.current) return;
        modRef.current = mod;
        setOptions(mod.listLanguages().slice(0, MAX_DATALIST_OPTIONS) as LanguageSummary[]);
        setLoaded(true);
      })
      .catch(() => {
        // Degrade to a plain free-text field on import failure (FR-009).
        if (!isMountedRef.current) return;
        setLoaded(true);
      });
  }, []);

  // Resolve the currently-typed text to a single entry, or null when it matches
  // nothing or is ambiguous (>1 entry sharing the English name). Selection —
  // handled in onSelect — always resolves unambiguously via the row's payload.
  function resolveTyped(text: string, results: readonly LanguageSummary[]): void {
    const trimmed = text.trim().toLowerCase();
    if (trimmed === "") {
      onEntryResolved?.(null);
      return;
    }
    const exact = results.filter((r) => (r.englishName ?? "").toLowerCase() === trimmed);
    onEntryResolved?.(exact.length === 1 ? exact[0]! : null);
  }

  function handleType(text: string): void {
    onChange(text);
    const mod = modRef.current;
    if (mod === null) return;
    const results = text.trim() ? mod.lookupByName(text) : mod.listLanguages();
    setOptions(results.slice(0, MAX_DATALIST_OPTIONS) as LanguageSummary[]);
    resolveTyped(text, results);
  }

  function handleOpen(): void {
    const mod = modRef.current;
    if (mod === null) return;
    const cur = strVal.trim();
    const results = cur ? mod.lookupByName(cur) : mod.listLanguages();
    setOptions(results.slice(0, MAX_DATALIST_OPTIONS) as LanguageSummary[]);
  }

  function handleSelect(opt: ComboOption): void {
    const summary = opt.data ?? null;
    // The answer value is the English NAME (not the code); the resolved identity
    // travels via onEntryResolved so downstream steps see the exact entry.
    const name = summary?.englishName ?? opt.value;
    onChange(name);
    onEntryResolved?.(summary);
    // Auto-advance runs last so onEntryResolved's synchronous seed refs are set
    // before the survey routes to (and seeds) the next question.
    onSelectAdvance?.(name);
  }

  const comboOptions: ComboOption[] = options.map((summary) => ({
    value: summary.code,
    label: nameOptionLabel(summary),
    data: summary,
  }));

  return (
    <StyledCombobox
      id={question.id}
      value={strVal}
      options={comboOptions}
      placeholder={loaded ? "Type your language name in English…" : "Loading languages…"}
      required={question.required === true}
      onType={handleType}
      onSelect={handleSelect}
      onOpen={handleOpen}
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

// Hard cap on datalist size. The full langtags index is ~8,000 entries;
// rendering them all as <option> elements janks real browsers and crashes
// embedded Electron webviews outright (VS Code's Simple Browser takes the
// whole window down with it). A native datalist dropdown only ever shows a
// handful of rows, and lookupByName returns ranked matches (exact code,
// then name prefixes, then substrings), so the useful suggestions survive
// the cut.
const MAX_DATALIST_OPTIONS = 50;

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
        // Pre-populate a capped slice so the datalist offers something to
        // browse before the user starts typing. Never the full list — see
        // MAX_DATALIST_OPTIONS above.
        if (!isMountedRef.current) return;
        const all = mod.listLanguages();
        setOptions(all.slice(0, MAX_DATALIST_OPTIONS) as LanguageSummary[]);
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
  // the query is empty we show the head of the list (capped) so browsing works.
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
          setOptions(results.slice(0, MAX_DATALIST_OPTIONS) as LanguageSummary[]);
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
// StyledCombobox — the shared dark-themed dropdown used by BOTH the langtags
// name picker (Q1) and the generic options autocomplete (Q2 / region), so their
// dropdowns look identical. It is purely presentational: the parent supplies the
// options to display and reacts to onType / onSelect; the combobox owns only the
// open/highlight UI state and keyboard navigation.
//
// A native <datalist> cannot be styled to match, and (for the langtags picker)
// cannot tell homonyms apart, which is why this custom listbox exists.
// ---------------------------------------------------------------------------

/** One selectable row. `data` carries an optional payload (e.g. the resolved
 *  LanguageSummary) so the parent knows exactly which entry was picked. */
interface ComboOption {
  value: string;
  label: string;
  data?: LanguageSummary;
}

interface StyledComboboxProps {
  id: string;
  value: string;
  options: ComboOption[];
  placeholder?: string;
  required?: boolean;
  onType: (text: string) => void;
  onSelect: (option: ComboOption) => void;
  /** Fired when the dropdown opens (focus / ArrowDown), so the parent can refresh
   *  its options for the current value if it needs to (the langtags picker does). */
  onOpen?: () => void;
}

function StyledCombobox({
  id,
  value,
  options,
  placeholder,
  required,
  onType,
  onSelect,
  onOpen,
}: StyledComboboxProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const listId = `listbox-${id}`;
  const showList = open && options.length > 0;

  function openList(): void {
    setOpen(true);
    onOpen?.();
  }

  function select(option: ComboOption): void {
    onSelect(option);
    setOpen(false);
    setHighlight(-1);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>): void {
    onType(e.target.value);
    setOpen(true);
    setHighlight(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        openList();
        return;
      }
      setHighlight((h) => Math.min(h + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      if (open && highlight >= 0 && highlight < options.length) {
        e.preventDefault();
        select(options[highlight]!);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setHighlight(-1);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    background: "#0d1117",
    border: "1px solid #30363d",
    borderRadius: 6,
    color: "#e6edf3",
    fontSize: 14,
    fontFamily: "inherit",
    boxSizing: "border-box",
    outline: "none",
  };

  return (
    <div style={{ position: "relative" }}>
      <input
        type="text"
        id={id}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-required={required === true}
        aria-activedescendant={
          highlight >= 0 && highlight < options.length ? `${listId}-opt-${highlight}` : undefined
        }
        autoComplete="off"
        {...(placeholder !== undefined ? { placeholder } : {})}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={openList}
        // Delay close so an option's onMouseDown registers before blur.
        onBlur={() => setTimeout(() => isMountedRef.current && setOpen(false), 120)}
        style={inputStyle}
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          style={{
            position: "absolute",
            zIndex: 20,
            top: "calc(100% + 2px)",
            left: 0,
            right: 0,
            margin: 0,
            padding: 4,
            listStyle: "none",
            background: "#161b22",
            border: "1px solid #30363d",
            borderRadius: 6,
            maxHeight: 240,
            overflowY: "auto",
            boxShadow: "0 6px 20px rgba(0,0,0,0.4)",
          }}
        >
          {options.map((opt, i) => (
            <li
              key={`${opt.value}-${i}`}
              id={`${listId}-opt-${i}`}
              role="option"
              aria-selected={i === highlight}
              data-value={opt.value}
              // onMouseDown (not onClick) so selection fires before the input's
              // onBlur closes the list.
              onMouseDown={(e) => {
                e.preventDefault();
                select(opt);
              }}
              onMouseEnter={() => setHighlight(i)}
              style={{
                padding: "6px 8px",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 13,
                color: "#e6edf3",
                background: i === highlight ? "#1f6feb" : "transparent",
              }}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
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
      <p style={{ fontSize: 13, color: TEXT_DIM, fontStyle: "italic" }}>
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
  /** Side-channel for the `@langtags_names` picker — see FieldProps.onEntryResolved. */
  onEntryResolved?: (entry: LanguageSummary | null) => void;
  /** Auto-advance callback for dropdown selections — see FieldProps.onSelectAdvance. */
  onSelectAdvance?: (value: string) => void;
}

export function QuestionField({
  question,
  value,
  onChange,
  findingsByQuestionId,
  onEntryResolved,
  onSelectAdvance,
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
        <p style={helpText}>{question.help_text}</p>
      )}

      {question.type === "text" || question.type === "short_text" ? (
        <TextFieldControl question={question} value={value} onChange={onChange} />
      ) : question.type === "autocomplete" ? (
        <AutocompleteField
          question={question}
          value={value}
          onChange={onChange}
          {...(onEntryResolved !== undefined ? { onEntryResolved } : {})}
          {...(onSelectAdvance !== undefined ? { onSelectAdvance } : {})}
        />
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

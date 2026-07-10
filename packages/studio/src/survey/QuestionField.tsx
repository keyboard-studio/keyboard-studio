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
      <LangtagsComboboxField
        question={question}
        value={value}
        onChange={onChange}
        valueMode="name"
        placeholder="Type your language name in English…"
        {...(onEntryResolved !== undefined ? { onEntryResolved } : {})}
        {...(onSelectAdvance !== undefined ? { onSelectAdvance } : {})}
      />
    );
  }

  // When options_source is "@langtags_iso639" (Q3 code confirmation):
  //  - if the survey injected candidate codes for the resolved language
  //    (getSeedOptions → question.options), offer THOSE possible matches in the
  //    styled dropdown (e.g. Hausa → "hau" / "ha"); otherwise
  //  - fall back to the full styled langtags picker (same rows as Q1) so an
  //    unresolved / free-text language can still be searched by name or code.
  // Both render the same StyledCombobox and commit the language CODE.
  if (question.options_source === "@langtags_iso639") {
    if ((question.options?.length ?? 0) > 0) {
      return (
        <StyledOptionsField
          question={question}
          value={value}
          onChange={onChange}
          {...(onSelectAdvance !== undefined ? { onSelectAdvance } : {})}
        />
      );
    }
    return (
      <LangtagsComboboxField
        question={question}
        value={value}
        onChange={onChange}
        valueMode="code"
        placeholder="Search by name, autonym, or code…"
        {...(onSelectAdvance !== undefined ? { onSelectAdvance } : {})}
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
  // NFC-normalize before case-folding so NFC/NFD variants of the same name
  // (Vietnamese, Yorùbá/Akan, Ainu diacritics) still match — these options carry
  // own-script autonyms in both value and label (IdentityLite.getSeedOptions),
  // matching the dedup key in IdentityLite.getSeedOptions and the comparison in
  // LangtagsComboboxField.resolveTyped.
  const q = typed.trim().normalize("NFC").toLowerCase();
  const exact = allOptions.some((o) => o.value.normalize("NFC") === typed.normalize("NFC"));
  const shown =
    q === "" || exact
      ? allOptions
      : allOptions.filter(
          (o) =>
            o.label.normalize("NFC").toLowerCase().includes(q) ||
            o.value.normalize("NFC").toLowerCase().includes(q),
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
// LangtagsComboboxField — the shared langtags-backed language picker behind both
// Q1 (`@langtags_names`, valueMode "name") and Q3 (`@langtags_iso639`, valueMode
// "code"). Both render the same StyledCombobox with the same rows (nameOptionLabel:
// "English / autonym — region (code)"), search the same in-memory langtags index,
// and cap the list identically — so the two dropdowns are visually and behaviourally
// identical; only what a pick commits differs (name vs code). The custom combobox
// (not a native datalist) is required for Q1 so homonyms sharing a display string
// stay distinguishable and each row can carry its resolved LanguageSummary payload.
//
// Resolution (name-mode only):
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

// Hard cap on how many rows the dropdown renders. The full langtags index is
// ~8,000 entries; rendering them all janks real browsers and crashes embedded
// Electron webviews (VS Code's Simple Browser takes the whole window down).
// lookupByName returns ranked matches (exact code, then name prefixes, then
// substrings), so the useful suggestions survive the cut.
const MAX_DATALIST_OPTIONS = 50;

/**
 * `valueMode` selects what a picked row commits as the answer:
 *   - `"name"` (Q1, `@langtags_names`): the English NAME, plus onEntryResolved
 *     carries the resolved entry so homonyms are told apart and downstream
 *     fields can be seeded.
 *   - `"code"` (Q3, `@langtags_iso639`): the language CODE; a pure picker with
 *     no entry resolution.
 */
interface LangtagsComboboxExtras {
  valueMode: "name" | "code";
  placeholder: string;
}

function LangtagsComboboxField({
  question,
  value,
  onChange,
  onEntryResolved,
  onSelectAdvance,
  valueMode,
  placeholder,
}: FieldProps & LangtagsComboboxExtras) {
  const strVal = stringValue(value);
  const [options, setOptions] = useState<LanguageSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Loaded langtags module, held so onType/onOpen can query it synchronously
  // (the in-memory index resolves once; no per-keystroke async — decision D3).
  const modRef = useRef<Awaited<ReturnType<typeof loadLangtags>> | null>(null);
  const loadedRef = useRef(false);
  const isMountedRef = useRef(true);
  // Mirrors the latest typed value for the load-.then callback below, which
  // closes over the value from mount time otherwise (empty-deps effect).
  const latestValueRef = useRef(strVal);
  latestValueRef.current = strVal;

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
        // A value typed before the module resolved never went through
        // handleType's lookup (modRef.current was still null), so re-run the
        // same lookup+resolve path now against whatever is currently typed —
        // otherwise a pre-load exact match silently never seeds onEntryResolved.
        // (No-op in code-mode: resolveTyped early-returns when onEntryResolved
        // is undefined.)
        const current = latestValueRef.current;
        if (current.trim() !== "") {
          const results = current.trim() ? mod.lookupByName(current) : mod.listLanguages();
          setOptions(results.slice(0, MAX_DATALIST_OPTIONS) as LanguageSummary[]);
          resolveTyped(current, results);
        }
      })
      .catch((err: unknown) => {
        // Degrade to a plain free-text field on import failure (FR-009).
        if (!isMountedRef.current) return;
        console.warn(
          "[LangtagsComboboxField] langtags load failed; degrading to free-text input",
          err,
        );
        setLoaded(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs exactly once on mount; resolveTyped is a stable per-render closure and re-running the effect would re-trigger the load
  }, []);

  // Resolve the currently-typed text to a single entry, or null when it matches
  // nothing or is ambiguous (>1 entry sharing the English name). Name-mode only;
  // code-mode is a plain picker with no onEntryResolved. Selection — handled in
  // onSelect — always resolves unambiguously via the row's payload.
  function resolveTyped(text: string, results: readonly LanguageSummary[]): void {
    if (onEntryResolved === undefined) return;
    // NFC-normalize before case-folding so NFC/NFD variants of the same name
    // compare equal — matches the own-name dedup key in IdentityLite.getSeedOptions.
    const trimmed = text.trim().normalize("NFC").toLowerCase();
    if (trimmed === "") {
      onEntryResolved(null);
      return;
    }
    const exact = results.filter(
      (r) => (r.englishName ?? "").normalize("NFC").toLowerCase() === trimmed,
    );
    onEntryResolved(exact.length === 1 ? exact[0]! : null);
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
    // Name-mode commits the English NAME (the resolved identity travels via
    // onEntryResolved); code-mode commits the language CODE (the option value).
    const committed = valueMode === "name" ? (summary?.englishName ?? opt.value) : opt.value;
    onChange(committed);
    onEntryResolved?.(summary);
    // Auto-advance runs last so onEntryResolved's synchronous seed refs are set
    // before the survey routes to (and seeds) the next question.
    onSelectAdvance?.(committed);
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
      placeholder={loaded ? placeholder : "Loading languages…"}
      required={question.required === true}
      onType={handleType}
      onSelect={handleSelect}
      onOpen={handleOpen}
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

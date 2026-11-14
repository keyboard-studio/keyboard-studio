// Per-type question field renderers, dispatched by SurveyRunner.
// Each renderer receives the current value (string | string[] | undefined)
// and calls onChange when the user modifies it.

import { devLog } from "@keyboard-studio/contracts/dev-log";
import { Suspense, lazy, useState, useEffect, useRef, useMemo } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { I18n } from "@lingui/core";
import type { FlowQuestion, SurveyContext } from "./types.ts";
import type { LintFinding, LanguageSummary, SearchMatch } from "@keyboard-studio/contracts";
import { LintChip } from "../lint/LintChip.tsx";
import { getLoadedLangtags, loadLangtags } from "../lib/langtagsDefaults.ts";
import { checkLanguageCode } from "./languageCodeCheck.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { proposeDialect, validateDialectSubtag, type DialectProposal } from "./dialectProposal.ts";
import { buildTargetBcp47 } from "./targetBcp47.ts";
import {
  TextField,
  Textarea,
  SelectMenu,
  RadioGroup,
  Notice,
  Label,
  MultiSelect,
} from "../ui/index.ts";
import type { SelectMenuOption } from "../ui/SelectMenu.tsx";
import type { RadioOption } from "../ui/RadioGroup.tsx";
import type { MultiSelectOption } from "../ui/MultiSelect.tsx";
import { helpText, TEXT_DIM } from "./surveyStyles.ts";
import { normalizeForCompare } from "../lib/normalizeForCompare.ts";
import { StyledCombobox, type ComboOption } from "./StyledCombobox.tsx";
import { resolveContentString, slugifyIdSegment } from "../lib/contentI18n.ts";
import { interpolate } from "./interpolate.ts";


// The language chooser (EthnoLib's search and its data) is its own lazy chunk: it
// loads with the language step, never on first page load (spec 115 FR-037).
const LazyLanguageChooser = lazy(() => import("./languageChooser/LanguageChooser.tsx"));

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
  /**
   * Survey answer context (spec 073 US1 fix) — carries `{{token}}` values
   * (e.g. `base_name`, `language_name`) so a resolved Tier B content-i18n
   * string can be interpolated AFTER catalog resolution, not before. Optional
   * and defaults to `{}` at the QuestionField boundary so existing/test
   * callers that don't pass it keep today's no-op-interpolation behavior
   * (an empty context leaves any `{{token}}` in the string as-is).
   */
  context?: SurveyContext;
}

/**
 * Resolve a flow-question Tier-B content string for the active locale, then
 * interpolate `{{token}}`s from the survey context. Resolution MUST precede
 * interpolation (see interpolate.ts) — a translated catalog value carries its
 * own `{{token}}` placeholders, so the *resolved* string is what gets
 * interpolated, never the English value that fed resolveContentString.
 * `field` is the catalog field segment (e.g. "prompt", "help_text", or
 * `option.<slug>.label`); `englishValue` is the raw record value used as the
 * fallback and the resolution seed.
 */
function resolveFlowText(
  question: FlowQuestion,
  field: string,
  englishValue: string,
  i18n: I18n,
  ctx: SurveyContext,
): string {
  return interpolate(
    resolveContentString("flowQuestions", question.id, field, englishValue, i18n),
    ctx,
  );
}

function stringValue(v: string | string[] | undefined): string {
  return typeof v === "string" ? v : "";
}

function arrayValue(v: string | string[] | undefined): string[] {
  return Array.isArray(v) ? v : [];
}

// Epic #533: the question prompt is the type-hierarchy anchor a step's card
// content — bumped from the ui/Label.tsx default (13px, shared by every
// other label in the app) up to a real prompt size. Applied here (an
// override via Label's own `style` pass-through) rather than in Label.tsx
// itself, since that primitive is used well beyond the survey and its
// default size is correct for those call sites.
const QUESTION_PROMPT_STYLE: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
  color: "var(--app-text)",
  lineHeight: 1.3,
};

// ---------------------------------------------------------------------------
// Text / short_text  →  ui TextField / Textarea
// ---------------------------------------------------------------------------

function TextFieldControl({ question, value, onChange }: FieldProps) {
  const { t } = useLingui();
  const isMultiLine = question.type === "text";
  const strVal = stringValue(value);
  // A free-text question that also carries `options` (injected per-render by
  // the host's getSeedOptions) offers them as a choice beneath the box: each
  // entry records its EXACT string, so there is no retyping path (the D4
  // exact-match dedupe hazard on il_copyright_holder). The box is the "someone
  // else" path. No options -> no selector (hidden, not disabled).
  const choices = question.options ?? [];
  const hasChoices = choices.length > 0;
  const chosen = hasChoices && choices.some((o) => o.value === strVal) ? strVal : null;
  // While a choice is selected the box shows empty: the choice IS the answer,
  // and mirroring it into the box would read as something typed to keep.
  const boxVal = chosen !== null ? "" : strVal;
  const labelId = `choices-label-${question.id}`;
  // Sentinel for the "someone else" radio; never emitted as an answer.
  const SOMEONE_ELSE = "__someone_else__";
  const control = isMultiLine ? (
    // `type: "text"` questions are the survey's genuinely open-ended fields
    // (long-form description prompts, e.g. phase_f_helpdocs) — the exact case
    // Textarea reserves `resize="vertical"` for (#536). Opt in explicitly so
    // these keep the resize handle they had before the resize:none default.
    <Textarea
      id={question.id}
      aria-required={question.required === true}
      value={boxVal}
      onChange={(e) => onChange(e.target.value)}
      rows={4}
      resize="vertical"
    />
  ) : (
    <TextField
      id={question.id}
      aria-required={question.required === true}
      value={boxVal}
      onChange={(e) => onChange(e.target.value)}
    />
  );
  if (!hasChoices) return control;
  const radioOptions: RadioOption[] = [
    ...choices.map((o) => ({ value: o.value, label: o.label })),
    {
      value: SOMEONE_ELSE,
      label: t({
        id: "survey.questionField.choices.someoneElse",
        message: "Someone else (type the name in the box above; leave it blank to credit the author)",
      }),
    },
  ];
  return (
    <>
      {control}
      <div style={{ marginTop: 12 }}>
        <div id={labelId} style={helpText}>
          {t({
            id: "survey.questionField.choices.startingPointHolders",
            message: "Or choose the starting point's copyright holder:",
          })}
        </div>
        <RadioGroup
          mode="list"
          name={`${question.id}-choices`}
          value={chosen ?? SOMEONE_ELSE}
          options={radioOptions}
          onChange={(v) => onChange(v === SOMEONE_ELSE ? "" : v)}
          ariaLabelledby={labelId}
        />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Autocomplete (text + datalist)  →  ui Autocomplete (object-form options)
// ---------------------------------------------------------------------------

function AutocompleteField({ question, value, onChange, onEntryResolved, onSelectAdvance }: FieldProps) {
  const { t } = useLingui();
  // Spec 115 US2: the dialect question is a confirmation of the chooser's
  // result, like il_language_code — its own renderer, not the generic
  // options dropdown.
  if (question.id === "il_language_dialect") {
    return <DialectField question={question} value={value} onChange={onChange} />;
  }
  // `@langtags_names` (spec 030 US1): the English-name-first picker. It shows
  // the language NAME in the field and reports the resolved entry via
  // onEntryResolved so homonyms (same name, different code) can be told apart.
  if (question.options_source === "@langtags_names") {
    return (
      <Suspense
        fallback={
          // Until the chooser chunk lands, a plain input keeps whatever is typed;
          // the chooser resolves it on mount.
          <input
            type="text"
            id={question.id}
            value={stringValue(value)}
            onChange={(e) => onChange(e.target.value)}
            placeholder={t({ id: "survey.questionField.langtagsCombobox.loading", message: "Loading languages…" })}
            autoComplete="off"
            aria-required={question.required === true}
            className="ks-control ks-focus-ring ks-hit-target"
            style={{ width: "100%", height: 42, padding: "0 12px", boxSizing: "border-box" }}
          />
        }
      >
        <LazyLanguageChooser
          id={question.id}
          value={stringValue(value)}
          required={question.required === true}
          onChange={onChange}
          {...(onEntryResolved !== undefined ? { onEntryResolved } : {})}
          {...(onSelectAdvance !== undefined ? { onSelectAdvance } : {})}
        />
      </Suspense>
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
    return (
      <LanguageCodeField
        question={question}
        value={value}
        onChange={onChange}
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
// LanguageCodeField — il_language_code as a CONFIRMATION of the chooser's result
// (spec 115 FR-033). The code arrives from the language chooser, a typed code or
// the unlisted panel; the field shows it, with what the registry says about it, and
// "Change" reopens the checked entry. There is no unchecked free text: the entry
// shows the parser's reason for an ill-formed code, and the question's validate()
// refuses it.
// ---------------------------------------------------------------------------

function LanguageCodeField({ question, value, onChange, onSelectAdvance }: FieldProps) {
  const { t } = useLingui();
  const code = stringValue(value).trim();
  const [changing, setChanging] = useState(false);
  const registered = getLoadedLangtags()?.registeredLanguage;
  const check = code === "" ? null : checkLanguageCode(code, typeof registered === "function" ? registered : null);

  const status =
    check === null
      ? null
      : !check.ok
        ? t({ id: "survey.codeField.invalid", message: `This is not a valid language code (${check.reason}).` })
        : check.privateUse
          ? t({ id: "survey.codeField.privateUse", message: "A private-use code (qaa to qtz)." })
          : check.registeredName !== undefined
            ? t({ id: "survey.codeField.registered", message: `Registered as ${check.registeredName}.` })
            : check.warning === "unregistered"
              ? t({ id: "survey.codeField.unregistered", message: "Well formed, but not in the ISO 639-3 registry. You can keep it." })
              : null;

  if (!changing && code !== "" && check !== null && check.ok) {
    return (
      <div>
        <p style={{ margin: 0 }}>
          <strong data-testid="language-code-value">{code}</strong>
          {status !== null && <span style={{ color: TEXT_DIM }}>{" — "}{status}</span>}
        </p>
        <button type="button" className="ks-focus-ring" onClick={() => setChanging(true)} style={{ marginTop: 6 }}>
          {t({ id: "survey.codeField.change", message: "Change" })}
        </button>
      </div>
    );
  }

  const picker =
    (question.options?.length ?? 0) > 0 ? (
      <StyledOptionsField
        question={question}
        value={value}
        onChange={onChange}
        {...(onSelectAdvance !== undefined ? { onSelectAdvance } : {})}
      />
    ) : (
      <LangtagsComboboxField
        question={question}
        value={value}
        onChange={onChange}
        placeholder={t({
          id: "survey.questionField.autocomplete.codePlaceholder",
          message: "Search by name, autonym, or code…",
        })}
        {...(onSelectAdvance !== undefined ? { onSelectAdvance } : {})}
      />
    );
  return (
    <div>
      {picker}
      {status !== null && (
        <p role="note" style={{ margin: "6px 0 0", fontSize: 13, color: TEXT_DIM }}>
          {status}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DialectField — il_language_dialect as a CONFIRMATION of the chooser's result
// (spec 115 US2). The dialect arrives from the search match the language was
// reached through; the field shows the proposal (dialect name + full tag) with
// Confirm / Edit / No dialect, or — with no proposal — the language's
// registered variants and tagset dialects as a list plus a name box that
// proposes from a typed name.
//
// Confirming records the proposal's source and the dialect's Glottolog code
// alongside the answer (the module's rendererWrites, written directly to the
// decision store — the LanguageChooser.enterDialectMode precedent); editing
// records source "typed" and drops the glottocode; "No dialect" clears the
// answer and both records. Nothing is written until the author confirms
// (Article X). The edit is validated per keystroke with the parser's reason
// in words.
// ---------------------------------------------------------------------------

/** A string decision's value, or "" when absent. */
function decisionString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function DialectField({ question, value, onChange }: FieldProps) {
  const { t } = useLingui();
  const decisions = useDecisionStore((s) => s.decisions);
  const [loadedTick, setLoadedTick] = useState(0);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState("");
  const [typedName, setTypedName] = useState("");
  const [typedMatch, setTypedMatch] = useState<SearchMatch | null>(null);

  // The proposal reads the loaded langtags module; subscribe to its arrival
  // so a question reached before the chunk lands still proposes.
  useEffect(() => {
    let live = true;
    void loadLangtags()
      .then(() => {
        if (live) setLoadedTick((n) => n + 1);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  // Re-render when the module lands: the proposal below is computed from it.
  void loadedTick;

  const code = decisionString(decisions["language-code"]?.value);
  const script = decisionString(decisions["target-script"]?.value);
  const region = decisionString(decisions["language-region"]?.value);
  const match = (decisions["language-search-match"]?.value ?? null) as SearchMatch | null;
  const current = stringValue(value);
  const source = decisionString(decisions["language-dialect-source"]?.value);
  const proposal = useMemo(
    () =>
      proposeDialect(
        {
          language: code,
          ...(script !== "" ? { script } : {}),
          ...(region !== "" ? { region } : {}),
        },
        typedMatch ?? match,
      ),
    [code, script, region, typedMatch, match],
  );

  const recordProposal = (p: DialectProposal): void => {
    const store = useDecisionStore.getState();
    store.record({
      id: "language-dialect-source",
      value: p.source,
      provenance: "derived",
      source: "il_language_dialect",
    });
    if (p.glottocode !== undefined) {
      store.record({
        id: "dialect-glottocode",
        value: p.glottocode,
        provenance: "derived",
        source: "il_language_dialect",
      });
    } else {
      store.forget("dialect-glottocode");
    }
  };
  const forgetDialectMeta = (): void => {
    const store = useDecisionStore.getState();
    store.forget("language-dialect-source");
    store.forget("dialect-glottocode");
  };
  // A pick from the list (no proposal): the subtag is a registered variant
  // or a langtags tagset by construction, and it carries no Glottolog code
  // of its own — the match's code belongs to the dialect the author did
  // not pick, so it is forgotten.
  const recordListPick = (subtag: string): void => {
    const store = useDecisionStore.getState();
    const mod = getLoadedLangtags();
    const tag = [code, script, region].filter((p) => p !== "").join("-");
    // A partial module (a test mock predating the dialect surface) cannot
    // tell a variant from a tagset — record "langtags" and move on.
    const isVariant =
      mod !== null && typeof mod.variantAllowed === "function" && subtag !== "" && mod.variantAllowed(tag, subtag);
    store.record({
      id: "language-dialect-source",
      value: isVariant ? "registered-variant" : "langtags",
      provenance: "derived",
      source: "il_language_dialect",
    });
    store.forget("dialect-glottocode");
  };

  const confirmProposal = (): void => {
    if (proposal === null) return;
    onChange(proposal.subtag);
    recordProposal(proposal);
  };
  const chooseNoDialect = (): void => {
    onChange("");
    forgetDialectMeta();
  };
  const proposeFromName = (): void => {
    const name = typedName.trim();
    if (name === "") return;
    setTypedMatch({ name, relation: "dialect", source: "typed" });
  };

  const confirmed = proposal !== null && current === proposal.subtag && source === proposal.source;
  const proposalName = (typedMatch ?? match)?.name ?? proposal?.subtag ?? "";
  const buttonRow = {
    display: "flex",
    gap: 8,
    marginTop: 6,
    flexWrap: "wrap" as const,
  };

  if (editing) {
    const check = validateDialectSubtag(edit);
    const reason =
      !check.ok && check.reason !== "empty"
        ? check.reason === "bad-private-use"
          ? t({
              id: "survey.dialectField.invalidPrivateUse",
              message: "after x-, use 1–8 letters or digits in each part",
            })
          : t({
              id: "survey.dialectField.invalidVariant",
              message: "use 5–8 letters or digits, or a digit followed by 3 letters or digits",
            })
        : null;
    const saveEdit = (): void => {
      if (!check.ok) return;
      const subtag = edit.trim();
      onChange(subtag);
      const store = useDecisionStore.getState();
      store.record({
        id: "language-dialect-source",
        value: "typed",
        provenance: "derived",
        source: "il_language_dialect",
      });
      store.forget("dialect-glottocode");
      setEditing(false);
    };
    return (
      <div>
        <input
          type="text"
          id={question.id}
          value={edit}
          onChange={(e) => setEdit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") saveEdit();
          }}
          aria-label={t({ id: "survey.dialectField.editLabel", message: "Dialect subtag" })}
          aria-required={question.required === true}
          autoComplete="off"
          className="ks-control ks-focus-ring ks-hit-target"
          style={{ width: "100%", height: 42, padding: "0 12px", boxSizing: "border-box" }}
        />
        {reason !== null && (
          <p role="note" style={{ margin: "6px 0 0", fontSize: 13, color: TEXT_DIM }}>
            {t({ id: "survey.dialectField.invalid", message: `Not a valid dialect subtag (${reason}).` })}
          </p>
        )}
        <div style={buttonRow}>
          <button type="button" className="ks-focus-ring" onClick={saveEdit} disabled={!check.ok}>
            {t({ id: "survey.dialectField.save", message: "Save" })}
          </button>
          <button type="button" className="ks-focus-ring" onClick={() => setEditing(false)}>
            {t({ id: "survey.dialectField.cancel", message: "Cancel" })}
          </button>
        </div>
      </div>
    );
  }

  // The proposal, offered (arrival: the seeded default) or confirmed.
  if (proposal !== null && (current === "" || current === proposal.subtag)) {
    return (
      <div>
        <p style={{ margin: 0 }}>
          <strong data-testid="dialect-proposal-tag">{proposal.fullTag}</strong>
          <span style={{ color: TEXT_DIM }}>
            {" — "}
            {proposalName}
          </span>
          {confirmed && (
            <span style={{ color: TEXT_DIM }}>
              {" — "}
              {t({ id: "survey.dialectField.confirmed", message: "Confirmed" })}
            </span>
          )}
        </p>
        <div style={buttonRow}>
          {!confirmed && (
            <button type="button" className="ks-focus-ring" onClick={confirmProposal}>
              {t({ id: "survey.dialectField.confirm", message: "Confirm" })}
            </button>
          )}
          <button
            type="button"
            className="ks-focus-ring"
            onClick={() => {
              setEdit(proposal.subtag);
              setEditing(true);
            }}
          >
            {t({ id: "survey.dialectField.edit", message: "Edit" })}
          </button>
          <button type="button" className="ks-focus-ring" onClick={chooseNoDialect}>
            {t({ id: "survey.dialectField.noDialect", message: "No dialect" })}
          </button>
        </div>
      </div>
    );
  }

  // An edited subtag is the answer: show it with its composed tag, and keep
  // the proposal one click away.
  if (current !== "" && proposal !== null) {
    return (
      <div>
        <p style={{ margin: 0 }}>
          <strong data-testid="dialect-current-tag">{buildTargetBcp47(code, script, region, current)}</strong>
          <span style={{ color: TEXT_DIM }}>
            {" — "}
            {current}
          </span>
        </p>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: TEXT_DIM }}>
          {t({ id: "survey.dialectField.suggestion", message: `Suggested: ${proposal.fullTag} (${proposalName}).` })}
        </p>
        <div style={buttonRow}>
          <button type="button" className="ks-focus-ring" onClick={confirmProposal}>
            {t({ id: "survey.dialectField.useSuggestion", message: "Use suggestion" })}
          </button>
          <button
            type="button"
            className="ks-focus-ring"
            onClick={() => {
              setEdit(current);
              setEditing(true);
            }}
          >
            {t({ id: "survey.dialectField.edit", message: "Edit" })}
          </button>
          <button type="button" className="ks-focus-ring" onClick={chooseNoDialect}>
            {t({ id: "survey.dialectField.noDialect", message: "No dialect" })}
          </button>
        </div>
      </div>
    );
  }

  // No proposal: the language's variants and tagset dialects as a list
  // (question.options, from IdentityLite.getSeedOptions), plus a name box
  // that proposes from a typed name.
  return (
    <div>
      <StyledOptionsField
        question={question}
        value={value}
        onChange={(v) => {
          const subtag = stringValue(v);
          onChange(subtag);
          if (subtag !== "") recordListPick(subtag);
          else forgetDialectMeta();
        }}
      />
      <div style={{ marginTop: 12 }}>
        <input
          type="text"
          value={typedName}
          onChange={(e) => setTypedName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") proposeFromName();
          }}
          aria-label={t({ id: "survey.dialectField.nameLabel", message: "Dialect name" })}
          placeholder={t({ id: "survey.dialectField.namePlaceholder", message: "Type a dialect name…" })}
          autoComplete="off"
          className="ks-control ks-focus-ring ks-hit-target"
          style={{ width: "100%", height: 42, padding: "0 12px", boxSizing: "border-box" }}
        />
        <div style={buttonRow}>
          <button type="button" className="ks-focus-ring" onClick={proposeFromName} disabled={typedName.trim() === ""}>
            {t({ id: "survey.dialectField.nameButton", message: "Find dialect" })}
          </button>
          <button type="button" className="ks-focus-ring" onClick={chooseNoDialect}>
            {t({ id: "survey.dialectField.noDialect", message: "No dialect" })}
          </button>
        </div>
      </div>
    </div>
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
  const q = normalizeForCompare(typed);
  const exact = allOptions.some((o) => o.value.normalize("NFC") === typed.normalize("NFC"));
  const shown =
    q === "" || exact
      ? allOptions
      : allOptions.filter(
          (o) =>
            normalizeForCompare(o.label).includes(q) || normalizeForCompare(o.value).includes(q),
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
// LangtagsComboboxField — the langtags-backed language CODE picker behind Q3
// (`@langtags_iso639`, only when the survey injected no candidate codes). It
// renders the shared StyledCombobox, searches the in-memory langtags index, and
// caps the list; a pick commits the language CODE. (The language NAME field,
// Q1, is the shared language chooser — survey/languageChooser — loaded lazily
// with the language step; spec 115.)
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

interface LangtagsComboboxExtras {
  placeholder: string;
}

function LangtagsComboboxField({
  question,
  value,
  onChange,
  onSelectAdvance,
  placeholder,
}: FieldProps & LangtagsComboboxExtras) {
  const { t } = useLingui();
  const strVal = stringValue(value);
  const [options, setOptions] = useState<LanguageSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Loaded langtags module, held so onType/onOpen can query it synchronously
  // (the in-memory index resolves once; no per-keystroke async — decision D3).
  const modRef = useRef<Awaited<ReturnType<typeof loadLangtags>> | null>(null);
  const loadedRef = useRef(false);
  const isMountedRef = useRef(true);
  const latestValueRef = useRef(strVal);
  latestValueRef.current = strVal;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const resultsFor = (mod: NonNullable<typeof modRef.current>, text: string): LanguageSummary[] =>
    (text.trim() ? mod.lookupByName(text) : mod.listLanguages()).slice(0, MAX_DATALIST_OPTIONS) as LanguageSummary[];

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    loadLangtags()
      .then((mod) => {
        if (!isMountedRef.current) return;
        modRef.current = mod;
        // A value typed before the module resolved never went through
        // handleType's lookup, so list matches for whatever is typed now.
        setOptions(resultsFor(mod, latestValueRef.current));
        setLoaded(true);
      })
      .catch((err: unknown) => {
        // Degrade to a plain free-text field on import failure (FR-009).
        if (!isMountedRef.current) return;
        devLog.warn(
          "[LangtagsComboboxField] langtags load failed; degrading to free-text input",
          err,
        );
        setLoaded(true);
      });
    // Runs exactly once on mount (loadedRef guards re-entry); the typed value is
    // read through latestValueRef, so the effect captures nothing reactive.
  }, []);

  function handleType(text: string): void {
    onChange(text);
    const mod = modRef.current;
    if (mod === null) return;
    setOptions(resultsFor(mod, text));
  }

  function handleOpen(): void {
    const mod = modRef.current;
    if (mod === null) return;
    setOptions(resultsFor(mod, strVal.trim()));
  }

  function handleSelect(opt: ComboOption): void {
    // Code-mode commits the language CODE (the option value).
    onChange(opt.value);
    onSelectAdvance?.(opt.value);
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
      placeholder={loaded ? placeholder : t({ id: "survey.questionField.langtagsCombobox.loading", message: "Loading languages…" })}
      required={question.required === true}
      onType={handleType}
      onSelect={handleSelect}
      onOpen={handleOpen}
    />
  );
}

// ---------------------------------------------------------------------------
// Select (native <select> does not open in the VS Code webview — #1307)
// →  ui SelectMenu
// ---------------------------------------------------------------------------

function SelectField({ question, value, onChange, context }: FieldProps) {
  const { t, i18n } = useLingui();
  const strVal = stringValue(value);
  // Leading placeholder option — matches the hardcoded "— Select one —" entry
  // of the now-removed ui/Dropdown (always first, selectable to reset to
  // unanswered), now actually localized (Dropdown's was a plain string, never
  // wrapped in t()).
  const selectOptions: SelectMenuOption[] = [
    { value: "", label: t({ id: "survey.selectField.placeholder", message: "— Select one —" }) },
    ...(question.options ?? []).map((opt) => ({
      value: opt.value,
      label: resolveFlowText(
        question,
        `option.${slugifyIdSegment(opt.value)}.label`,
        opt.label,
        i18n,
        context ?? {},
      ),
    })),
  ];
  return (
    <SelectMenu
      id={question.id}
      ariaLabelledby={`label-${question.id}`}
      required={question.required === true}
      value={strVal}
      options={selectOptions}
      onChange={(v) => onChange(v)}
    />
  );
}

// ---------------------------------------------------------------------------
// Radio group  →  ui RadioGroup (mode="list")
// ---------------------------------------------------------------------------

function RadioField({ question, value, onChange, context }: FieldProps) {
  const { i18n } = useLingui();
  const ctx = context ?? {};
  const strVal = stringValue(value);
  const radioOptions: RadioOption[] = (question.options ?? []).map((opt) => ({
    value: opt.value,
    label: resolveFlowText(
      question,
      `option.${slugifyIdSegment(opt.value)}.label`,
      opt.label,
      i18n,
      ctx,
    ),
    // The per-option helper line is rendered prose — resolve it through the
    // same Tier B catalog path as the label (extracted as option.<slug>.note).
    ...(opt.note !== undefined
      ? {
          note: resolveFlowText(
            question,
            `option.${slugifyIdSegment(opt.value)}.note`,
            opt.note,
            i18n,
            ctx,
          ),
        }
      : {}),
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

function MultiSelectField({ question, value, onChange, context }: FieldProps) {
  const { i18n } = useLingui();
  const arrVal = arrayValue(value);
  const options = question.options ?? [];

  if (options.length === 0 && question.options_source !== undefined) {
    return (
      <p style={{ fontSize: 13, color: TEXT_DIM, fontStyle: "italic" }}>
        <Trans id="survey.questionField.multiSelect.dynamicOptionsNotLoaded">
          Dynamic options ({question.options_source}) not loaded in this build.
        </Trans>
      </p>
    );
  }

  const msOptions: MultiSelectOption[] = options.map((opt) => ({
    value: opt.value,
    label: resolveFlowText(
      question,
      `option.${slugifyIdSegment(opt.value)}.label`,
      opt.label,
      i18n,
      context ?? {},
    ),
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

function NoticeField({ question, context }: Pick<FieldProps, "question" | "context">) {
  const { i18n } = useLingui();
  const ctx = context ?? {};
  const resolvedBody =
    question.body !== undefined
      ? resolveFlowText(question, "body", question.body, i18n, ctx)
      : undefined;
  const resolvedHelpText =
    question.help_text !== undefined
      ? resolveFlowText(question, "help_text", question.help_text, i18n, ctx)
      : undefined;
  const resolvedPrompt =
    question.prompt !== undefined
      ? resolveFlowText(question, "prompt", question.prompt, i18n, ctx)
      : undefined;
  return (
    <Notice>
      {resolvedBody ?? resolvedHelpText ?? resolvedPrompt}
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
  /** Survey answer context for `{{token}}` interpolation — see FieldProps.context. */
  context?: SurveyContext;
}

export function QuestionField({
  question,
  value,
  onChange,
  findingsByQuestionId,
  onEntryResolved,
  onSelectAdvance,
  context,
}: QuestionFieldProps) {
  // Findings are associated to questions by id via a caller-supplied map.
  // LintFinding has no questionId field by design (see contracts/lintFinding.ts);
  // the survey<->lint bridge owns the mapping.
  const relevant = findingsByQuestionId?.[question.id] ?? [];

  const { i18n } = useLingui();
  const ctx = context ?? {};
  const resolvedPrompt =
    question.prompt !== undefined
      ? resolveFlowText(question, "prompt", question.prompt, i18n, ctx)
      : undefined;
  const resolvedLabel =
    question.label !== undefined
      ? resolveFlowText(question, "label", question.label, i18n, ctx)
      : undefined;
  const labelText = resolvedPrompt ?? resolvedLabel ?? question.id;
  const resolvedHelpText =
    question.help_text !== undefined
      ? resolveFlowText(question, "help_text", question.help_text, i18n, ctx)
      : undefined;

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
            style={QUESTION_PROMPT_STYLE}
          >
            {labelText}
          </Label>
        ) : (
          <Label
            id={`label-${question.id}`}
            htmlFor={question.id}
            required={question.required === true}
            style={QUESTION_PROMPT_STYLE}
          >
            {labelText}
          </Label>
        );
      })()}

      {resolvedHelpText !== undefined && question.type !== "notice" && (
        <p style={helpText}>{resolvedHelpText}</p>
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
        <SelectField
          question={question}
          value={value}
          onChange={onChange}
          {...(context !== undefined ? { context } : {})}
        />
      ) : question.type === "radio" ? (
        <RadioField
          question={question}
          value={value}
          onChange={onChange}
          {...(context !== undefined ? { context } : {})}
        />
      ) : question.type === "bool" ? (
        <BoolField question={question} value={value} onChange={onChange} />
      ) : question.type === "multi_select" ? (
        <MultiSelectField
          question={question}
          value={value}
          onChange={onChange}
          {...(context !== undefined ? { context } : {})}
        />
      ) : question.type === "notice" ? (
        <NoticeField question={question} {...(context !== undefined ? { context } : {})} />
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

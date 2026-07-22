// Phase B survey wrapper — Character inventory discovery (spec §8 step 4).
//
// Two discovery methods are offered:
//   build-list  — unified "add your whole alphabet": tick CLDR suggestions, type
//                 the rest of the alphabet, browse+toggle the right-pane
//                 character map (CharacterMapPane.tsx, rendered by StudioShell's
//                 SurveyView — see stores/phaseBDraftStore.ts for the shared
//                 alphabet the two panes both mutate) (DEFAULT)
//   manual      — step-by-step questions via SurveyRunner
//
// On completion, extractInventory() scans the Phase B answers for the question
// ids that carry character data, splits them into NFC graphemes, and populates
// SurveyPhaseResult.confirmedInventory (additive contract field). The gallery
// reads this via session.confirmedInventory (mergePhaseResults union).

import { useCallback, useMemo, useState, useRef, useEffect, type ReactNode } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import type { SurveyAnswer, SurveyPhaseResult, LintFinding, PlacementMap } from "@keyboard-studio/contracts";
import { toUPlusNotation } from "@keyboard-studio/contracts";
import { SurveyRunner } from "./SurveyRunner.tsx";
import { loadModularFlow } from "./loadModularFlow.ts";
import type { SurveyContext, FlowDef } from "./types.ts";
import { buildPlacementSeeds } from "./placementSeeds.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSurveySessionStore, type DiscoveryMethod } from "../stores/surveySessionStore.ts";
import { usePhaseBDraftStore } from "../stores/phaseBDraftStore.ts";
import { nfcDedup } from "./charNormUtils.ts";
import { prefixCombiningMark } from "../lib/irToCarveNodes.ts";
import { suggestMissingChars } from "../lib/services.ts";
import type { MissingCharSuggestions } from "../lib/services.ts";
import { RadioGroup, SelectMenu } from "../ui/index.ts";
import {
  BG_PAGE,
  BORDER,
  ACCENT,
  TEXT_DIM,
  TEXT_MAIN,
  FONT,
  ERROR_RED,
  phaseContainer,
  phaseHeading,
  phaseHeadingFlush,
  mutedNote,
  mutedParaFlush,
  sectionHeading,
  divider,
  secondaryButton,
  primaryButton,
  charChip,
  chipGlyph,
  chipCodepoint,
  chipIndicator,
  chipIndicatorText,
  chipIndicatorColor,
  visuallyHidden,
  FONT_OPTIONS,
  phaseBFontStack,
} from "./surveyStyles.ts";

// Vite ?raw import — typed via the `*.yaml?raw` declaration in src/vite-env.d.ts.
import phaseBModularRaw from "../../../../content/flows/phase_b_characters.modular.yaml?raw";

// Question id that begins the manual step-by-step path.
// makeManualOnlyFlow routes pb_discovery_intro straight here.
const PHASE_B_MANUAL_ENTRY = "pb_routing_branch";

// ---------------------------------------------------------------------------
// Character extraction — populates confirmedInventory on the phase result
// ---------------------------------------------------------------------------

// Question ids whose answers contain character data (spec §8 step 4).
// Text answers are split on whitespace; multi_select values are individual entries.
const CHAR_TEXT_IDS = new Set<string>([
  "pb_special_letters_list",    // "ŋ Ŋ ɛ Ɛ ɔ Ɔ" etc.
  "pb_latin_digraphs_list",     // "sh ts ny ng"
  "pb_indic_nukta_detail",      // consonant letters taking dot-below
  "pb_indic_vowels_onset_list", // independent vowel letters
  "pb_syllabic_finals_detail",  // final-consonant marks
  "pb_other_free_entry",        // free-entry characters
  "pb_rtl_special_letters",     // RTL language-specific letters
]);

// pb_picker_confirm is multi_select — each value is a single grapheme or token.
const CHAR_MULTI_SELECT_ID = "pb_picker_confirm";

/**
 * Extract NFC graphemes from the character-bearing Phase B answers.
 * Text answers (CHAR_TEXT_IDS) are whitespace-split; picker multi_select entries
 * (pb_picker_confirm) are taken as-is. Empties and whitespace-only tokens are
 * dropped. Deduplicated, first-appearance order.
 *
 * NOTE: nfcDedup normalizes each token to NFC before deduplication, so all entries
 * in the returned array are NFC-normalized. This function does NOT handle the pasted
 * text sample (pb_text_sample) — that path is consumed by harvestFromText() in
 * CharacterDiscoveryServiceImpl, which applies its own NFC guard at entry.
 */
function extractInventory(answers: SurveyAnswer[]): string[] {
  let result: string[] = [];

  for (const answer of answers) {
    if (CHAR_TEXT_IDS.has(answer.questionId) && answer.answerType === "text") {
      const tokens = (answer.value as string).split(/\s+/);
      result = nfcDedup(result, tokens);
    } else if (
      answer.questionId === CHAR_MULTI_SELECT_ID &&
      answer.answerType === "char-list"
    ) {
      result = nfcDedup(result, answer.value as string[]);
    }
  }

  return result;
}

/**
 * Parse a space-delimited character string into a deduplicated NFC array.
 * Exported for unit testing.
 *
 * "a b c ŋ ŋ" → ["a", "b", "c", "ŋ"]
 */
export function parseSpacedChars(input: string): string[] {
  return nfcDedup([], input.split(/\s+/));
}

// ---------------------------------------------------------------------------
// PhaseB state — intercept non-manual discovery choices
// ---------------------------------------------------------------------------

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; data: MissingCharSuggestions | null }
  | { status: "error" };

// Return a modified FlowDef that starts at pb_routing_branch, skipping the
// discovery-intro question, so the runner goes straight into manual questions.
function makeManualOnlyFlow(flow: FlowDef): FlowDef {
  return {
    ...flow,
    questions: flow.questions.map((q) =>
      q.id === "pb_discovery_intro"
        ? { ...q, required: false, engine_resolved: true, next: PHASE_B_MANUAL_ENTRY }
        : q,
    ),
  };
}

// ---------------------------------------------------------------------------
// getFirstGrapheme — module-level helper, not exported
// ---------------------------------------------------------------------------

function getFirstGrapheme(s: string): string {
  if (!s) return "";
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const seg = new Intl.Segmenter();
    const [first] = seg.segment(s);
    return first?.segment ?? "";
  }
  return [...s][0] ?? "";
}

// ---------------------------------------------------------------------------
// CharChipEditor — reusable type-in input + chip list (no state of its own)
// ---------------------------------------------------------------------------

/**
 * Presentational component: a text input that adds characters (first grapheme
 * per space-separated token) and a chip grid that shows accumulated chars with
 * remove buttons. State is owned by the parent.
 */
interface CharChipEditorProps {
  chars: string[];
  onChange: (next: string[]) => void;
  /** When true, auto-focus the input on mount. */
  autoFocus?: boolean;
}

function CharChipEditor({ chars, onChange, autoFocus = false }: CharChipEditorProps) {
  const { t } = useLingui();
  const selectedFont = usePhaseBDraftStore((s) => s.selectedFont);
  const glyphFontStack = phaseBFontStack(selectedFont);
  const [inputVal, setInputVal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  function add(): void {
    const trimmed = inputVal.trim().normalize("NFC");
    if (!trimmed) return;
    const tokens = trimmed.split(/\s+/).filter(Boolean);
    const newChars = tokens.map(getFirstGrapheme).filter(Boolean);
    if (newChars.length === 0) return;
    onChange(nfcDedup(chars, newChars));
    setInputVal("");
    inputRef.current?.focus();
  }

  const addDisabled = inputVal.trim() === "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Input row */}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          ref={inputRef}
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={t({
            id: "survey.phaseB.charChipEditor.placeholder",
            message: "Type your alphabet with a space between each character (a b c …)",
          })}
          aria-label={t({ id: "survey.phaseB.charChipEditor.ariaLabel", message: "Character to add" })}
          style={{
            flex: 1,
            background: BG_PAGE,
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            color: TEXT_MAIN,
            fontSize: 16,
            fontFamily: FONT,
            padding: "8px 12px",
            boxSizing: "border-box",
          }}
        />
        <button
          type="button"
          disabled={addDisabled}
          onClick={add}
          style={{ ...primaryButton(addDisabled), whiteSpace: "nowrap" }}
        >
          <Trans id="survey.phaseB.charChipEditor.addButton">+ Add</Trans>
        </button>
      </div>

      {/* Chip grid */}
      <div>
        <p
          style={{
            margin: "0 0 8px 0",
            fontSize: 13,
            fontWeight: 600,
            color: TEXT_MAIN,
          }}
        >
          <Trans id="survey.phaseB.charChipEditor.count">Your alphabet ({chars.length})</Trans>
        </p>
        {chars.length === 0 ? (
          <p style={mutedParaFlush}>
            <Trans id="survey.phaseB.charChipEditor.empty">
              No characters yet — type your whole alphabet above, with a space
              between each character.
            </Trans>
          </p>
        ) : (
          <div
            role="group"
            aria-label={t({
              id: "survey.phaseB.charChipEditor.groupAriaLabel",
              message: "Accumulated characters — click to remove",
            })}
            style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}
          >
            {chars.map((c) => (
              // This delete chip is always in one visual state, not a toggle.
              // The charChip/chipGlyph booleans below are FIXED literals chosen
              // to reproduce the original inline hex (unchecked shell + accent
              // glyph), not real checked state — do not wire them to a value.
              <button
                key={c}
                type="button"
                onClick={() => onChange(chars.filter((x) => x !== c))}
                aria-label={t({
                  id: "survey.phaseB.charChipEditor.removeAriaLabel",
                  message: `Remove ${{ char: c }} (${{ cp: toUPlusNotation(c) }})`,
                })}
                style={charChip(false)}
              >
                <span style={chipGlyph(true, glyphFontStack)}>
                  {c}
                </span>
                <span style={chipCodepoint}>
                  {toUPlusNotation(c)}
                </span>
                <span style={chipIndicator(ERROR_RED)}>x</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SuggestionChip — a single CLDR suggestion chip (toggleable)
// ---------------------------------------------------------------------------

interface SuggestionChipProps {
  char: string;
  checked: boolean;
  onToggle: (c: string) => void;
}

function SuggestionChip({ char, checked, onToggle }: SuggestionChipProps) {
  const { t } = useLingui();
  const selectedFont = usePhaseBDraftStore((s) => s.selectedFont);
  const glyphFontStack = phaseBFontStack(selectedFont);
  const cp = toUPlusNotation(char);
  const actionLabel = checked
    ? t({ id: "survey.phaseB.suggestionChip.removeAction", message: "Remove" })
    : t({ id: "survey.phaseB.suggestionChip.addAction", message: "Add" });
  return (
    <button
      type="button"
      onClick={() => onToggle(char)}
      aria-label={`${actionLabel} ${char} (${cp})`}
      aria-pressed={checked}
      style={charChip(checked)}
    >
      <span style={chipGlyph(checked, glyphFontStack)}>
        {char}
      </span>
      <span style={chipCodepoint}>{cp}</span>
      <span style={chipIndicator(chipIndicatorColor(checked))}>
        {chipIndicatorText(checked)}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// SuggestionPanel — CLDR-grounded suggestions panel
// ---------------------------------------------------------------------------

interface SuggestionPanelProps {
  context: SurveyContext;
  chars: string[];
  onChange: (next: string[]) => void;
}

function SuggestionPanel({ context, chars, onChange }: SuggestionPanelProps) {
  const { t } = useLingui();
  const baseIr = useWorkingCopyStore((s) => s.baseIr);
  const bcp47 = context.bcp47_tag;
  const languageName = context.language_name;

  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [auxExpanded, setAuxExpanded] = useState(false);

  // Fetch suggestions whenever bcp47 or baseIr changes.
  useEffect(() => {
    if (!bcp47 || baseIr === null) {
      return;
    }
    let cancelled = false;
    setLoadState({ status: "loading" });
    suggestMissingChars(bcp47, baseIr, languageName)
      .then((result) => {
        if (!cancelled) setLoadState({ status: "done", data: result });
      })
      .catch(() => {
        if (!cancelled) setLoadState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [bcp47, baseIr, languageName]);

  function handleToggle(c: string): void {
    const nfc = c.normalize("NFC");
    if (chars.includes(nfc)) {
      onChange(chars.filter((x) => x !== nfc));
    } else {
      onChange(nfcDedup(chars, [nfc]));
    }
  }

  const displayName =
    languageName ?? bcp47 ?? t({ id: "survey.phaseB.suggestionPanel.genericLanguage", message: "this language" });

  // Neutral note when no BCP47 or no baseIr yet
  if (!bcp47 || baseIr === null) {
    return (
      <div style={mutedNote}>
        <Trans id="survey.phaseB.suggestionPanel.noVerifiedList">
          No verified character list for {displayName}. Add characters below.
        </Trans>
      </div>
    );
  }

  if (loadState.status === "idle" || loadState.status === "loading") {
    return (
      <div style={mutedNote}>
        <Trans id="survey.phaseB.suggestionPanel.checking">Checking for a verified character list…</Trans>
      </div>
    );
  }

  if (loadState.status === "error") {
    return (
      <div style={mutedNote}>
        <Trans id="survey.phaseB.suggestionPanel.loadError">
          Could not load character suggestions. Add characters below.
        </Trans>
      </div>
    );
  }

  const { data } = loadState;

  // null = no CLDR data
  if (data === null) {
    return (
      <div style={mutedNote}>
        <Trans id="survey.phaseB.suggestionPanel.noVerifiedList">
          No verified character list for {displayName}. Add characters below.
        </Trans>
      </div>
    );
  }

  // Empty main + auxiliary = base already covers the alphabet
  if (data.main.length === 0 && data.auxiliary.length === 0) {
    return (
      <div style={mutedNote}>
        <Trans id="survey.phaseB.suggestionPanel.baseAlreadyCovers">
          Your base keyboard already covers this language's alphabet.
        </Trans>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <p style={{ margin: "0 0 4px 0", fontSize: 13, fontWeight: 600, color: TEXT_MAIN }}>
          <Trans id="survey.phaseB.suggestionPanel.suggestedFor">
            Suggested for {data.languageName ?? displayName}
          </Trans>
        </p>
        <p style={{ margin: "0 0 10px 0", fontSize: 11, color: TEXT_DIM }}>
          <Trans id="survey.phaseB.suggestionPanel.fromCldr">from CLDR exemplars — tick to add</Trans>
        </p>
        {data.main.length > 0 ? (
          <div
            role="group"
            aria-label={t({
              id: "survey.phaseB.suggestionPanel.mainGroupAriaLabel",
              message: "Suggested main characters — tick to add",
            })}
            style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
          >
            {data.main.map((c) => (
              <SuggestionChip
                key={c}
                char={c}
                checked={chars.includes(c.normalize("NFC"))}
                onToggle={handleToggle}
              />
            ))}
          </div>
        ) : (
          <p style={mutedParaFlush}>
            <Trans id="survey.phaseB.suggestionPanel.noAdditionalMain">No additional main characters needed.</Trans>
          </p>
        )}
      </div>

      {data.auxiliary.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setAuxExpanded((v) => !v)}
            aria-expanded={auxExpanded}
            style={{
              background: "transparent",
              border: "none",
              color: TEXT_DIM,
              fontSize: 12,
              cursor: "pointer",
              padding: "4px 0",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span>{auxExpanded ? "▼" : "▶"}</span>
            <Trans id="survey.phaseB.suggestionPanel.auxiliaryToggle">
              Also used in loanwords ({data.auxiliary.length})
            </Trans>
          </button>
          {auxExpanded && (
            <div
              role="group"
              aria-label={t({
                id: "survey.phaseB.suggestionPanel.auxiliaryGroupAriaLabel",
                message: "Suggested auxiliary characters for loanwords — tick to add",
              })}
              style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}
            >
              {data.auxiliary.map((c) => (
                <SuggestionChip
                  key={c}
                  char={c}
                  checked={chars.includes(c.normalize("NFC"))}
                  onToggle={handleToggle}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AlphabetBreakdown — the visible three-store decomposition (spec 046, US5)
//
// Renders only once the draft alphabet implies at least one mark or attested
// combination: picking a whole accented character (one action, one unit of
// selection) visibly lands its base in Letters and its mark in Marks, teaching
// the underlying model without an interrupting question (FR-003). Chips here
// are a VIEW of the derived stores, not remove buttons — removal stays on the
// pick chips above (removing a pick automatically retracts what it implied).
// ---------------------------------------------------------------------------

function AlphabetBreakdown() {
  const bases = usePhaseBDraftStore((s) => s.bases);
  const marks = usePhaseBDraftStore((s) => s.marks);
  const attestedStacks = usePhaseBDraftStore((s) => s.attestedStacks);
  const lastPick = usePhaseBDraftStore((s) => s.lastPick);

  if (marks.length === 0 && attestedStacks.length === 0) return null;

  const composedStack = (stack: { base: string; marks: string[] }): string =>
    (stack.base + stack.marks.join("")).normalize("NFC");
  const justAddedBases = new Set(lastPick?.addedBases ?? []);
  const justAddedMarks = new Set(lastPick?.addedMarks ?? []);
  const justAddedStack =
    lastPick?.addedStack != null ? composedStack(lastPick.addedStack) : null;

  const chip = (glyph: string, display: string, justAdded: boolean) => (
    <span
      key={glyph}
      aria-label={`${display} (${toUPlusNotation(glyph)})${justAdded ? " — just added" : ""}`}
      style={charChip(false)}
    >
      <span style={chipGlyph(true)}>{display}</span>
      <span style={chipCodepoint}>{toUPlusNotation(glyph)}</span>
      {justAdded && <span style={chipIndicator(ACCENT)}>new</span>}
    </span>
  );

  const section = (
    testid: string,
    title: string,
    note: string,
    children: ReactNode,
  ) => (
    <div data-testid={testid} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: TEXT_MAIN }}>{title}</p>
      <p style={{ ...mutedParaFlush, margin: 0, fontSize: 12 }}>{note}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{children}</div>
    </div>
  );

  return (
    <section aria-label="How your alphabet breaks down" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <h3 style={sectionHeading}>How your alphabet breaks down</h3>
      {bases.length > 0 &&
        section(
          "alphabet-letters",
          `Letters (${bases.length})`,
          "Letters that stand on their own.",
          bases.map((b) => chip(b, b, justAddedBases.has(b))),
        )}
      {marks.length > 0 &&
        section(
          "alphabet-marks",
          `Marks (${marks.length})`,
          "Accents and other marks that attach to a letter.",
          marks.map((m) => chip(m, prefixCombiningMark(m, true), justAddedMarks.has(m))),
        )}
      {attestedStacks.length > 0 &&
        section(
          "alphabet-accented",
          `Accented letters (${attestedStacks.length})`,
          "Letter-plus-mark combinations your language uses.",
          attestedStacks.map((s) => {
            const composed = composedStack(s);
            return chip(composed, composed, justAddedStack === composed);
          }),
        )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// BuildListView — unified "add your whole alphabet" method
//
// The alphabet accumulated here is shared with CharacterMapPane (the right-pane
// character map, rendered independently by StudioShell's SurveyView) via
// phaseBDraftStore — both panes toggle the SAME chars array. See
// stores/phaseBDraftStore.ts for the lifecycle contract (reset on substage
// entry, not on every render).
// ---------------------------------------------------------------------------

interface BuildListViewProps {
  context: SurveyContext;
  onComplete: (result: SurveyPhaseResult) => void;
  onBack: () => void;
}

function BuildListView({ context, onComplete, onBack }: BuildListViewProps) {
  const { t } = useLingui();
  const chars = usePhaseBDraftStore((s) => s.chars);
  const setAll = usePhaseBDraftStore((s) => s.setAll);
  const selectedFont = usePhaseBDraftStore((s) => s.selectedFont);
  const setSelectedFont = usePhaseBDraftStore((s) => s.setSelectedFont);
  const doneDisabled = chars.length === 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 24,
        maxWidth: 640,
        fontFamily: FONT,
        color: TEXT_MAIN,
      }}
    >
      {/* Back */}
      <button
        type="button"
        onClick={onBack}
        style={{ alignSelf: "flex-start", ...secondaryButton }}
      >
        <Trans id="survey.phaseB.buildList.backButton">Back</Trans>
      </button>

      {/* Heading */}
      <h2 style={phaseHeadingFlush}>
        <Trans id="survey.phaseB.buildList.heading">Phase B — Add your whole alphabet</Trans>
      </h2>

      {/* Font selection — custom SelectMenu (webview-safe dropdown): native
          <select> popups don't open in the VS Code Simple Browser, so this is
          a DOM-rendered menu. Applies to every character glyph on this step,
          incl. the character map — see phaseBDraftStore.selectedFont. */}
      <div style={{ maxWidth: 280 }} data-testid="phase-b-font-select">
        <label id="phase-b-font-select-label"
               style={{ display: "block", margin: "0 0 8px 0", fontSize: 13, fontWeight: 600, color: TEXT_MAIN }}>
          <Trans id="survey.phaseB.buildList.fontSelectLabel">Font for characters</Trans>
        </label>
        <SelectMenu
          id="phase-b-font-select-control"
          value={selectedFont}
          options={FONT_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
          ariaLabelledby="phase-b-font-select-label"
          renderOptionLabel={(opt) => (
            <span style={{ fontFamily: phaseBFontStack(opt.value) }}>{opt.label}</span>
          )}
          onChange={(v) => {
            const opt = FONT_OPTIONS.find((o) => o.value === v);
            if (opt) setSelectedFont(opt.value);
          }}
        />
      </div>

      {/* Instructions */}
      <div
        style={{
          padding: "12px 16px",
          border: `1px solid ${BORDER}`,
          borderLeft: `3px solid ${ACCENT}`,
          borderRadius: 6,
          fontSize: 14,
          lineHeight: 1.6,
        }}
      >
        <p style={{ margin: 0 }}>
          <Trans id="survey.phaseB.buildList.instructions">
            Add <strong>your whole alphabet</strong> on this page — every
            character your language uses, not just the special ones. Tick the
            suggested characters below, then type any that are missing{" "}
            <strong>with a space between each character</strong>, like this:
          </Trans>
        </p>
        <p style={{ margin: "8px 0 0 0", fontFamily: "monospace", fontSize: 15 }}>
          a b c d e ɛ ŋ ɔ …
        </p>
      </div>

      {/* Section 1: Suggestions from CLDR */}
      <section
        aria-label={t({
          id: "survey.phaseB.buildList.cldrSectionAriaLabel",
          message: "Suggested characters from CLDR",
        })}
      >
        <h3 style={sectionHeading}>
          <Trans id="survey.phaseB.buildList.suggestedCharactersHeading">Suggested characters</Trans>
        </h3>
        <SuggestionPanel context={context} chars={chars} onChange={setAll} />
      </section>

      {/* Divider */}
      <hr style={divider} />

      {/* Section 2: Type-in characters */}
      <section
        aria-label={t({ id: "survey.phaseB.buildList.typeSectionAriaLabel", message: "Type your alphabet" })}
      >
        <h3 style={sectionHeading}>
          <Trans id="survey.phaseB.buildList.typeAlphabetHeading">Type your alphabet</Trans>
        </h3>
        <p style={{ ...mutedParaFlush, margin: "0 0 12px 0" }}>
          <Trans id="survey.phaseB.buildList.typeAlphabetHelp">
            Type the rest of your alphabet here, putting a space between each
            character (for example: a b c ŋ ɛ), then press Enter or + Add.
          </Trans>
        </p>
        <CharChipEditor chars={chars} onChange={setAll} autoFocus={false} />
      </section>

      {/* Section 3: visible three-store decomposition (spec 046 US5) —
          renders only when the alphabet implies marks or accented letters. */}
      <AlphabetBreakdown />

      {/* The character grid has moved to the right pane —
          see CharacterMapPane.tsx, rendered by StudioShell's SurveyView. */}

      {/* Footer: Done */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          data-testid="phase-b-done"
          disabled={doneDisabled}
          onClick={() => {
            onComplete({
              phase: "B",
              answers: [],
              confirmedInventory: chars,
            });
          }}
          className="ks-focus-ring ks-hit-target"
          style={primaryButton(doneDisabled)}
        >
          {t({
            id: "survey.phaseB.buildList.doneButton",
            message: plural(chars.length, {
              one: "Done (# character)",
              other: "Done (# characters)",
            }),
          })}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PhaseB component
// ---------------------------------------------------------------------------

export interface PhaseBProps {
  context?: SurveyContext;
  onComplete: (result: SurveyPhaseResult) => void;
  onBack?: () => void;
  findingsByQuestionId?: Record<string, LintFinding[]>;
  /**
   * Optional placement map from the kbgen seeder (spec §7.6 / §8 Phase B).
   * When present, PlacementMap codepoints above the confidence threshold are
   * used to pre-fill pb_special_letters_list with the characters the seeder
   * knows the language needs.
   *
   * The placement data (vkey, modifiers) is NOT wired to any Phase B question —
   * Phase B has no question asking which key a character should go on.  The
   * seeder's key-assignment proposals belong to a future Phase C placement
   * confirmation step (out of scope for v1).
   *
   * Providing this prop does NOT affect the §7.2 StrategyRecommendation path
   * (D3 scope guard): the seeded value populates the question input as a plain
   * pre-fill; the user confirms or overrides it before it enters SurveyPhaseResult.
   */
  placementMap?: PlacementMap;
}

export function PhaseB({ context = {}, onComplete, onBack, findingsByQuestionId, placementMap }: PhaseBProps) {
  const flow = useMemo(() => loadModularFlow(phaseBModularRaw as string), []);
  // discoveryMethod lives in surveySessionStore (not component state) so
  // StudioShell's SurveyView can gate the right-pane character map on it —
  // the map only shows for the build-list path (see steps/manifest.ts's
  // rightPane:"character-map" on the characters step).
  const discoveryMethod = useSurveySessionStore((s) => s.discoveryMethod);
  const setDiscoveryMethod = useSurveySessionStore((s) => s.setDiscoveryMethod);
  // manualFlow is memoized here (before any early returns) to satisfy React's
  // rules of hooks — useMemo must not be called after a conditional return.
  const manualFlow = useMemo(() => makeManualOnlyFlow(flow), [flow]);

  // Build the placement seed lookup from the PlacementMap (if provided).
  // Recompute only when placementMap changes (reference equality).
  const placementSeeds = useMemo(
    () => (placementMap !== undefined ? buildPlacementSeeds(placementMap) : new Map<string, string>()),
    [placementMap],
  );

  // getSeedValue: called by SurveyRunner before pushing each question.
  // Returns the seeded default for pb_special_letters_list when the placement
  // map provided characters above the threshold; undefined otherwise.
  const getSeedValue = useCallback(
    (questionId: string): string | string[] | undefined => placementSeeds.get(questionId),
    [placementSeeds],
  );

  if (discoveryMethod === null) {
    return (
      <IntroChooser
        context={context}
        onChoose={setDiscoveryMethod}
        {...(onBack !== undefined ? { onBack } : {})}
      />
    );
  }

  if (discoveryMethod === "build-list") {
    return (
      <BuildListView
        context={context}
        onComplete={onComplete}
        onBack={() => setDiscoveryMethod(null)}
      />
    );
  }

  // Wrap onComplete to inject confirmedInventory before forwarding the result.
  // Not wrapped in useCallback intentionally — mirrors the IdentityLite.tsx neighbor pattern;
  // SurveyRunner captures onComplete via an internal ref (SurveyRunner.tsx:260), so a fresh
  // reference per render is harmless.
  function handleComplete(result: SurveyPhaseResult): void {
    onComplete({
      ...result,
      confirmedInventory: extractInventory(result.answers),
    });
  }

  // Manual path — use a patched flow that skips the intro question
  return (
    <div style={phaseContainer}>
      <h2 style={phaseHeading}>
        <Trans id="survey.phaseB.manual.heading">Phase B — Character inventory</Trans>
      </h2>
      <SurveyRunner
        key={manualFlow.flow_id}
        flow={manualFlow}
        context={context}
        onComplete={handleComplete}
        onBack={() => setDiscoveryMethod(null)}
        getSeedValue={getSeedValue}
        {...(findingsByQuestionId !== undefined ? { findingsByQuestionId } : {})}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// IntroChooser — the discovery method selection card
// ---------------------------------------------------------------------------

interface IntroChooserProps {
  context: SurveyContext;
  onChoose: (method: DiscoveryMethod) => void;
  onBack?: () => void;
}

function IntroChooser({ context, onChoose, onBack }: IntroChooserProps) {
  const { t } = useLingui();
  const [selected, setSelected] = useState<DiscoveryMethod>("build-list");

  const languageName =
    context["language_name"] ?? context["detected_group"] ?? t({ id: "survey.phaseB.intro.genericLanguage", message: "your language" });

  const methods: Array<{ value: DiscoveryMethod; label: string }> = [
    {
      value: "build-list",
      label: t({
        id: "survey.phaseB.intro.method.buildList",
        message: "Add your whole alphabet — type every character your language uses and tick suggested ones",
      }),
    },
    {
      value: "manual",
      label: t({
        id: "survey.phaseB.intro.method.manual",
        message: "Step by step — I will answer the questions below",
      }),
    },
  ];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 20,
        fontFamily: FONT,
        color: TEXT_MAIN,
      }}
    >
      <h2 style={phaseHeadingFlush}>
        <Trans id="survey.phaseB.intro.heading">Phase B — Character discovery</Trans>
      </h2>
      <p style={mutedParaFlush}>
        <Trans id="survey.phaseB.intro.question">How would you like to add the alphabet {languageName} uses?</Trans>
      </p>
      <p style={{ margin: 0, fontSize: 12, color: TEXT_DIM, lineHeight: 1.5 }}>
        <Trans id="survey.phaseB.intro.explanation">
          Both methods feed the same final alphabet.
          The first method starts with verified suggestions and lets you type the rest of your alphabet yourself.
        </Trans>
      </p>

      {/* Issue #536: shared ui/RadioGroup (accent-ring focus, >=44px touch
          hit area on the wrapping label) instead of a hand-rolled radio list. */}
      <span id="discovery-method-label" style={visuallyHidden}>
        <Trans id="survey.phaseB.intro.discoveryMethodLabel">Discovery method</Trans>
      </span>
      <RadioGroup
        name="discovery_method"
        value={selected}
        options={methods}
        accent={ACCENT}
        onChange={(v) => setSelected(v as DiscoveryMethod)}
        ariaLabelledby="discovery-method-label"
      />

      <div style={{ display: "flex", gap: 8 }}>
        {onBack !== undefined && (
          <button
            type="button"
            onClick={onBack}
            className="ks-focus-ring ks-hit-target"
            style={secondaryButton}
          >
            <Trans id="survey.phaseB.intro.backButton">Back</Trans>
          </button>
        )}
        <button
          type="button"
          data-testid="phase-b-intro-next"
          onClick={() => onChoose(selected)}
          className="ks-focus-ring ks-hit-target"
          style={primaryButton(false)}
        >
          <Trans id="survey.phaseB.intro.continueButton">Continue</Trans>
        </button>
      </div>
    </div>
  );
}

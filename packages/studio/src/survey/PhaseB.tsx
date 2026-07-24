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
import { useGlyphFontStack } from "./useGlyphFontStack.ts";
import { nfcDedup, harvestChars, casePairOf } from "./charNormUtils.ts";
import { codepointLabel } from "./codepointLabel.ts";
import { collate, codePointCompare } from "./collation.ts";
import { glyphCategory, isCombiningMarkChar, caseCounterpart } from "@keyboard-studio/engine";
import { displayChar, prefixCombiningMark } from "../lib/irToCarveNodes.ts";
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
// isLinguisticChar — the "Your alphabet" chip-list filter (spec 047, FR-011)
// ---------------------------------------------------------------------------

/**
 * True when a captured grapheme is linguistic content — a letter, a combining
 * mark (diacritic), or a letter+mark combination — and therefore belongs in the
 * "Your alphabet" running list. Numbers, punctuation, symbols, separators, and
 * control characters are excluded here (they remain visible in their own
 * breakdown sections). A letter+mark combo classifies as `letter` because it
 * contains a letter code point; a lone mark is caught by isCombiningMarkChar.
 */
function isLinguisticChar(c: string): boolean {
  return isCombiningMarkChar(c) || glyphCategory(c) === "letter";
}

// ---------------------------------------------------------------------------
// CpLabel — chip code-point label with the FR-014 multi-code-point affordance
// ---------------------------------------------------------------------------

/**
 * Renders a chip's code-point label (spec 047 FR-014): the base code point in
 * U+XXXX notation, followed — for a multi-code-point grapheme — by a bracketed
 * "[+<extra marks>]" badge in a contrasting (accent) color that shows the extra
 * combining mark(s) themselves. The full space-separated stack is exposed on
 * the chip's hover title/accessible name by the caller.
 */
function CpLabel({ grapheme }: { grapheme: string }) {
  const { base, extras } = codepointLabel(grapheme);
  return (
    <span style={chipCodepoint()}>
      {base}
      {extras !== "" && (
        <span style={{ color: ACCENT, fontWeight: 700 }}>{`[+${extras}]`}</span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// CharChipEditor — reusable type-in input + chip list (no state of its own)
// ---------------------------------------------------------------------------

/**
 * Presentational component: a text input that captures every distinct grapheme
 * typed or pasted (spec 047 FR-001, via harvestChars) and a chip grid that
 * shows the accumulated LINGUISTIC characters (letters/marks/combos, FR-011)
 * with remove buttons. State is owned by the parent.
 */
interface CharChipEditorProps {
  chars: string[];
  onChange: (next: string[]) => void;
  /** When true, auto-focus the input on mount. */
  autoFocus?: boolean;
  /** BCP47 tag for locale-correct case-collapse of the letter chips (FR-008). */
  bcp47?: string | undefined;
}

function CharChipEditor({ chars, onChange, autoFocus = false, bcp47 }: CharChipEditorProps) {
  const { t } = useLingui();
  const glyphFontStack = useGlyphFontStack();
  const [inputVal, setInputVal] = useState("");
  const [showUppercase, setShowUppercase] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  function add(): void {
    // Capture EVERY distinct character in the whole input, not just the first
    // grapheme of each space-separated token (spec 047 FR-001). harvestChars
    // drops only CR/LF/CRLF/Tab/space (FR-002) and reports retained unusual
    // invisibles so we can log them for discoverability (FR-003).
    const { chars: harvested, unusual } = harvestChars(inputVal);
    if (harvested.length === 0) return;
    if (unusual.length > 0) {
      // FR-003: no in-UI alert is required — a console log makes the unusual
      // separator/format/control characters discoverable to the developer.
      console.info(
        "[phase-b] kept unusual invisible character(s): " +
          unusual.map((u) => codepointLabel(u).title).join(", "),
      );
    }
    // When BOTH cases of a letter exist, show the lowercase: an entered
    // uppercase that has a single-character lowercase counterpart is folded to
    // that lowercase for the alphabet/UI (both cases still reach the recorded IR
    // via the record-both-cases augmentation on Done). An uppercase with NO
    // lowercase counterpart — and a lowercase with no uppercase (IPA) — is left
    // exactly as chosen (caseCounterpart returns null, so no fold). Only the
    // uppercase→lowercase direction ever folds; lowercase is never touched.
    const folded = harvested.map((c) => {
      const cc = caseCounterpart(c, bcp47);
      return cc?.direction === "toLower" ? cc.counterpart : c;
    });
    onChange(nfcDedup(chars, folded));
    setInputVal("");
    inputRef.current?.focus();
  }

  const addDisabled = inputVal.trim() === "";
  // "Your alphabet" shows only linguistic content (FR-011); non-letters remain
  // visible in their breakdown sections below. Ordering: letters and
  // letter+mark combos by default ICU collation (matching the breakdown
  // sections); bare combining marks by raw Unicode code-point order (a diacritic
  // has no meaningful dictionary position), listed after the letters.
  const linguisticChars = chars.filter(isLinguisticChar);
  const bareMarks = linguisticChars.filter(isCombiningMarkChar).sort(codePointCompare);
  const letters = linguisticChars.filter((c) => !isCombiningMarkChar(c));
  // Case-collapse the letters to their lowercase/caseless unit (FR-008/FR-010):
  // hide an uppercase only when its lowercase is actually present; a lowercase or
  // caseless (or uppercase-only) letter is shown as entered.
  const upperOf = (b: string): string | null => {
    const cc = caseCounterpart(b, bcp47);
    return cc?.direction === "toUpper" ? cc.counterpart : null;
  };
  const hiddenUppers = new Set<string>();
  for (const b of letters) {
    const u = upperOf(b);
    if (u !== null) hiddenUppers.add(u);
  }
  const displayLetters = collate(letters.filter((b) => !hiddenUppers.has(b)));
  // Count reflects the collapsed lowercase/caseless units + bare marks.
  const unitCount = displayLetters.length + bareMarks.length;
  const hasCasedLetter = letters.some((b) => upperOf(b) !== null);

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
          <Trans id="survey.phaseB.charChipEditor.count">Your alphabet ({displayLetters.length + bareMarks.length})</Trans>
        </p>
        {hasCasedLetter && (
          <label
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: TEXT_DIM, cursor: "pointer", margin: "0 0 8px 0" }}
          >
            <input
              type="checkbox"
              data-testid="your-alphabet-uppercase-toggle"
              checked={showUppercase}
              onChange={(e) => setShowUppercase(e.target.checked)}
            />
            <Trans id="survey.phaseB.breakdown.showUppercase">Show uppercase letters</Trans>
          </label>
        )}
        {unitCount === 0 ? (
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
            {displayLetters.flatMap((c) => {
              // Removable chip for the lowercase/caseless (or uppercase-only)
              // letter. The charChip/chipGlyph booleans are FIXED literals
              // reproducing the original inline hex (unchecked shell + accent
              // glyph), not real checked state — do not wire them to a value.
              const { title } = codepointLabel(c);
              const cells = [
                <button
                  key={c}
                  type="button"
                  title={title}
                  onClick={() => {
                    // Removing a letter removes BOTH cases (the inverse of the
                    // map, which adds both) — even the uppercase hidden by the
                    // case-collapse, so it never re-appears as an orphan chip.
                    const pair = new Set(casePairOf(c, bcp47));
                    onChange(chars.filter((x) => !pair.has(x)));
                  }}
                  aria-label={t({
                    id: "survey.phaseB.charChipEditor.removeAriaLabel",
                    message: `Remove ${{ char: c }} (${{ cp: title }})`,
                  })}
                  style={charChip(false)}
                >
                  <span style={chipGlyph(true, glyphFontStack)}>{displayChar(c)}</span>
                  <CpLabel grapheme={c} />
                  <span style={chipIndicator(ERROR_RED)}>x</span>
                </button>,
              ];
              // Derived uppercase (display-only) when the toggle is on — mirrors
              // the breakdown Letters section; not a removable pick.
              const upper = showUppercase ? upperOf(c) : null;
              if (upper !== null) {
                const upperTitle = codepointLabel(upper).title;
                cells.push(
                  <span
                    key={upper}
                    title={upperTitle}
                    aria-label={`${displayChar(upper)} (${upperTitle})`}
                    style={{ ...charChip(false), cursor: "default" }}
                  >
                    <span style={chipGlyph(true, glyphFontStack)}>{displayChar(upper)}</span>
                    <CpLabel grapheme={upper} />
                  </span>,
                );
              }
              return cells;
            })}
            {bareMarks.map((c) => {
              const { title } = codepointLabel(c);
              return (
                <button
                  key={c}
                  type="button"
                  title={title}
                  onClick={() => onChange(chars.filter((x) => x !== c))}
                  aria-label={t({
                    id: "survey.phaseB.charChipEditor.removeAriaLabel",
                    message: `Remove ${{ char: c }} (${{ cp: title }})`,
                  })}
                  style={charChip(false)}
                >
                  <span style={chipGlyph(true, glyphFontStack)}>{displayChar(c)}</span>
                  <CpLabel grapheme={c} />
                  <span style={chipIndicator(ERROR_RED)}>x</span>
                </button>
              );
            })}
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
  const glyphFontStack = useGlyphFontStack();
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
        {displayChar(char)}
      </span>
      <span style={chipCodepoint()}>{cp}</span>
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

interface AlphabetBreakdownProps {
  /** BCP47 tag for locale-correct case derivation in the Letters section (FR-008). */
  bcp47?: string | undefined;
}

function AlphabetBreakdown({ bcp47 }: AlphabetBreakdownProps) {
  const bases = usePhaseBDraftStore((s) => s.bases);
  const marks = usePhaseBDraftStore((s) => s.marks);
  const attestedStacks = usePhaseBDraftStore((s) => s.attestedStacks);
  const numbers = usePhaseBDraftStore((s) => s.numbers);
  const punctuation = usePhaseBDraftStore((s) => s.punctuation);
  const symbols = usePhaseBDraftStore((s) => s.symbols);
  const separators = usePhaseBDraftStore((s) => s.separators);
  const controls = usePhaseBDraftStore((s) => s.controls);
  const lastPick = usePhaseBDraftStore((s) => s.lastPick);
  const [showUppercase, setShowUppercase] = useState(false);

  // Render once the alphabet has any content to break down. Spec 047 US3 shows
  // the Letters section (with its lowercase/uppercase toggle) even for a
  // letters-only alphabet, so bases alone are enough to reveal the panel — the
  // per-section guards below still hide every empty section (FR-006).
  if (
    bases.length === 0 &&
    marks.length === 0 &&
    attestedStacks.length === 0 &&
    numbers.length === 0 &&
    punctuation.length === 0 &&
    symbols.length === 0 &&
    separators.length === 0 &&
    controls.length === 0
  ) {
    return null;
  }

  const composedStack = (stack: { base: string; marks: string[] }): string =>
    (stack.base + stack.marks.join("")).normalize("NFC");
  const justAddedBases = new Set(lastPick?.addedBases ?? []);
  const justAddedMarks = new Set(lastPick?.addedMarks ?? []);
  const justAddedStack =
    lastPick?.addedStack != null ? composedStack(lastPick.addedStack) : null;

  const chip = (glyph: string, display: string, justAdded: boolean) => {
    const { title } = codepointLabel(glyph);
    return (
      <span
        key={glyph}
        title={title}
        aria-label={`${display} (${title})${justAdded ? " — just added" : ""}`}
        // Breakdown chips are a read-only VIEW (not remove buttons), so no
        // pointer cursor — removal stays on the CharChipEditor pick chips above.
        style={{ ...charChip(false), cursor: "default" }}
      >
        <span style={chipGlyph(true)}>{display}</span>
        <CpLabel grapheme={glyph} />
        {justAdded && <span style={chipIndicator(ACCENT)}>new</span>}
      </span>
    );
  };

  const section = (
    testid: string,
    title: string,
    note: string,
    children: ReactNode,
    extraHeader?: ReactNode,
  ) => (
    <div data-testid={testid} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: TEXT_MAIN }}>{title}</p>
      <p style={{ ...mutedParaFlush, margin: 0, fontSize: 12 }}>{note}</p>
      {extraHeader}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{children}</div>
    </div>
  );

  // Letters case-collapse (FR-008/FR-010): show one chip per lowercase/caseless
  // letter; a present uppercase is hidden behind its lowercase (never the
  // reverse) and revealed only under the toggle.
  const upperOf = (b: string): string | null => {
    const cc = caseCounterpart(b, bcp47);
    return cc?.direction === "toUpper" ? cc.counterpart : null;
  };
  const hiddenUppers = new Set<string>();
  for (const b of bases) {
    const u = upperOf(b);
    if (u !== null) hiddenUppers.add(u);
  }
  const displayBases = collate(bases.filter((b) => !hiddenUppers.has(b)));

  const uppercaseToggle = (
    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: TEXT_DIM, cursor: "pointer" }}>
      <input
        type="checkbox"
        data-testid="letters-uppercase-toggle"
        checked={showUppercase}
        onChange={(e) => setShowUppercase(e.target.checked)}
      />
      <Trans id="survey.phaseB.breakdown.showUppercase">Show uppercase letters</Trans>
    </label>
  );

  return (
    <section aria-label="How your alphabet breaks down" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <h3 style={sectionHeading}>How your alphabet breaks down</h3>
      {displayBases.length > 0 &&
        section(
          "alphabet-letters",
          `Letters (${displayBases.length})`,
          "Letters that stand on their own.",
          displayBases.flatMap((b) => {
            const u = showUppercase ? upperOf(b) : null;
            const cells = [chip(b, b, justAddedBases.has(b))];
            if (u !== null) cells.push(chip(u, u, false));
            return cells;
          }),
          uppercaseToggle,
        )}
      {marks.length > 0 &&
        section(
          "alphabet-marks",
          `Marks (${marks.length})`,
          "Accents and other marks that attach to a letter.",
          // Bare diacritics: raw code-point order, not ICU (spec 047 refinement).
          [...marks].sort(codePointCompare).map((m) => chip(m, prefixCombiningMark(m, true), justAddedMarks.has(m))),
        )}
      {attestedStacks.length > 0 &&
        section(
          "alphabet-accented",
          `Accented letters (${attestedStacks.length})`,
          "Letter-plus-mark combinations your language uses.",
          collate(attestedStacks.map(composedStack)).map((composed) =>
            chip(composed, composed, justAddedStack === composed),
          ),
        )}
      {numbers.length > 0 &&
        section(
          "alphabet-numbers",
          `Numbers (${numbers.length})`,
          "Digits and other numeric characters.",
          collate(numbers).map((c) => chip(c, c, false)),
        )}
      {punctuation.length > 0 &&
        section(
          "alphabet-punctuation",
          `Punctuation (${punctuation.length})`,
          "Punctuation marks.",
          collate(punctuation).map((c) => chip(c, c, false)),
        )}
      {symbols.length > 0 &&
        section(
          "alphabet-symbols",
          `Symbols (${symbols.length})`,
          "Currency, math, and other symbols.",
          collate(symbols).map((c) => chip(c, c, false)),
        )}
      {separators.length > 0 &&
        section(
          "alphabet-separators",
          `Separators (${separators.length})`,
          "Spaces and other separator characters (kept, not the ordinary space).",
          collate(separators).map((c) => chip(c, displayChar(c), false)),
        )}
      {controls.length > 0 &&
        section(
          "alphabet-controls",
          `Control/other (${controls.length})`,
          "Invisible control or format characters that were kept.",
          collate(controls).map((c) => chip(c, displayChar(c), false)),
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
        <CharChipEditor chars={chars} onChange={setAll} autoFocus={false} bcp47={context.bcp47_tag} />
      </section>

      {/* Section 3: visible three-store decomposition (spec 046 US5) + the
          spec-047 category sections — renders once the alphabet implies marks,
          accented letters, or any non-letter category. */}
      <AlphabetBreakdown bcp47={context.bcp47_tag} />

      {/* The character grid has moved to the right pane —
          see CharacterMapPane.tsx, rendered by StudioShell's SurveyView. */}

      {/* Footer: Done */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          data-testid="phase-b-done"
          disabled={doneDisabled}
          onClick={() => {
            // Record both cases (spec 047 FR-009): augment the captured
            // inventory with each cased letter's locale-correct counterpart via
            // the engine's caseCounterpart, deduped. A null counterpart
            // (caseless script, or a multi-character expansion like ß→SS)
            // contributes nothing (FR-010).
            const derivedUppercases = chars
              .map((c) => caseCounterpart(c, context.bcp47_tag)?.counterpart)
              .filter((u): u is string => u != null);
            onComplete({
              phase: "B",
              answers: [],
              confirmedInventory: nfcDedup(chars, derivedUppercases),
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

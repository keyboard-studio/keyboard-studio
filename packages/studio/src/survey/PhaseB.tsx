// Phase B survey wrapper — Character inventory discovery (spec §8 step 4).
//
// Discovery methods offered at the IntroChooser:
//   exemplars   — start from the alphabet the pinned CLDR+SLDR index already
//                 has for this language (spec 044). Offered FIRST and
//                 pre-selected whenever a sourced inventory exists, absent
//                 entirely when it does not. Accepting seeds the draft and
//                 lands on the same build-list page, prefilled; it is not a
//                 separate persisted DiscoveryMethod.
//   build-list  — unified "add your whole alphabet": type every character
//                 your language uses, browse+toggle the right-pane
//                 character map (CharacterMapPane.tsx, rendered by StudioShell's
//                 SurveyView — the two panes both mutate the shared
//                 character-inventory alphabet) (DEFAULT)
//   manual      — step-by-step questions via SurveyRunner
//
// On completion, extractInventory() scans the Phase B answers for the question
// ids that carry character data, splits them into NFC graphemes, and populates
// SurveyPhaseResult.confirmedInventory (additive contract field). The gallery
// reads this via session.confirmedInventory (mergePhaseResults union).

import { devLog } from "@keyboard-studio/contracts/dev-log";
import { useCallback, useMemo, useState, useRef, useEffect, type ReactNode } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { msg, plural } from "@lingui/core/macro";
import type { SurveyAnswer, SurveyPhaseResult, LintFinding, PlacementMap } from "@keyboard-studio/contracts";
import { composeStack } from "@keyboard-studio/contracts";
import { SurveyRunner } from "./SurveyRunner.tsx";
import { TextSampleAffordance } from "./TextSampleAffordance.tsx";
import { RefreshExemplarsAffordance } from "./RefreshExemplarsAffordance.tsx";
import { flowSources, loadFlowSourceDef } from "../steps/flowSources.ts";
import type { SurveyContext, FlowDef } from "./types.ts";
import { buildPlacementSeeds } from "./placementSeeds.ts";
import { useSurveySessionStore, type DiscoveryMethod } from "../stores/surveySessionStore.ts";
import {
  getCharacterInventoryValue,
  useInventoryDraft,
} from "./useInventoryDraft.ts";
import { useSurveyAnswerStore } from "../stores/surveyAnswerStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useRecordQuestionAnswers } from "../lib/questionRecorder.ts";
import { useFlaggedNextGate } from "../hooks/useFlaggedNextGate.ts";
import { deriveCharacterFlags, CHARACTERS_BUILD_LIST_SCREEN_ID } from "./characterFlags.ts";
import { reproposalCueMessage } from "./reproposalReason.ts";
import { FlaggedAnswersList } from "../components/FlaggedAnswersList.tsx";
import { useGlyphFontStack } from "./useGlyphFontStack.ts";
import { usePublishStepNav } from "../hooks/usePublishStepNav.ts";
import {
  nfcDedup,
  harvestChars,
  casePairOf,
  lowercaseBaseView,
  upperCounterpartOf,
} from "./charNormUtils.ts";
import { codepointLabel } from "./codepointLabel.ts";
import { matchesQuery } from "./characterSearch.ts";
import { collate, codePointCompare, collateInventory } from "./collation.ts";
import { glyphCategory, isCombiningMarkChar, caseCounterpart } from "@keyboard-studio/engine";
import {
  buildListDoneDisabled,
  buildListDoneResult,
  continueFromIntro,
  isCasedBaseOf,
  resolveIntroSelection,
  restampFlaggedAdditions,
  type IntroChoice,
} from "./charactersStepRules.ts";
import { displayChar, prefixCombiningMark } from "../lib/irToCarveNodes.ts";
import { charactersInTier } from "../lib/services.ts";
import type {
  ExemplarSource,
  ExemplarInventory,
  SourcedInventory,
} from "../lib/services.ts";
import { useSourcedExemplars } from "./useSourcedExemplars.ts";
import { useSourcedExemplarsBoth } from "./useSourcedExemplarsBoth.ts";
import { CpLabel } from "./CpLabel.tsx";
import { RadioGroup } from "../ui/index.ts";
import {
  BG_PAGE,
  BORDER,
  ACCENT,
  TEXT_DIM,
  TEXT_MAIN,
  FONT,
  ERROR_RED,
  surveyPageColumn,
  phaseHeading,
  phaseHeadingFlush,
  mutedParaFlush,
  sectionHeading,
  secondaryButton,
  primaryButton,
  charChip,
  chipGlyph,
  chipIndicator,
  chipIndicatorColor,
  chipIndicatorText,
  visuallyHidden,
} from "./surveyStyles.ts";

// Question id that begins the manual step-by-step path.
// makeManualOnlyFlow routes pb_discovery_intro straight here.
const PHASE_B_MANUAL_ENTRY = "pb_routing_branch";

// Manifest step id (steps/manifest.ts's "characters" entry) — the position for
// this step is owned SOLELY by CharactersStep.tsx (spec 079 T035/T081, single
// writer): "prefill" | "intro" | "build-list", or — while
// discoveryMethod === "manual" — a question id owned by SurveyRunner's own
// per-question cursor (T031). PhaseB itself no longer reads or writes that
// position; it only reads/writes `discoveryMethod` (surveySessionStore),
// which CharactersStep observes to compute the position value. This also
// means a standalone `<PhaseB>` render (as in PhaseB*.test.tsx) never touches
// surveyAnswerStore at all.

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
// ---------------------------------------------------------------------------
// useIsCasedBase — the character step's casing gate (spec 048 FR-006)
//
// Whether ANY case behaviour happens on this step is decided once, from the
// BASE keyboard: the working-copy IR's `casing` facet, read through the
// effective-value accessor — the same signal the marks step reads
// (MarksSeriesStep) and the work-to-do hook reads. "cased"/"mixed" opens the
// gate; a caseless base (or no base yet, facet undetermined) closes it, and
// every case behaviour on this step — the type-in fold, the lowercase
// collapse and its "Show uppercase" toggles, pair-wise chip removal, loanword
// pairing, and the Done pass-through that records both cases for carve — is
// skipped, so a stray Latin loanword letter on a caseless base is never
// auto-paired to an uppercase. `caseCounterpart` is unchanged: it still
// derives the actual pairs, but only once this gate is open.
// ---------------------------------------------------------------------------

function useIsCasedBase(): boolean {
  const startIr = useWorkingCopyStore((s) => s.startIr);
  return isCasedBaseOf(startIr);
}

/**
 * Inventory size above which the "Your alphabet" chip list gets a clutter
 * filter (issue 543). The threshold follows the carve Inspector precedent
 * (glyph sets over 40 items get a filter): at or below it the whole alphabet
 * scans fine as one chip grid, and a filter control would itself be clutter.
 */
export const INVENTORY_FILTER_THRESHOLD = 40;

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
  /**
   * Remove specific characters, rather than replacing the whole list.
   *
   * Clicking a chip is a per-character REJECTION (spec 044 FR-017) — the store
   * has to see it as such so a removed proposal is never re-proposed. Routing
   * it through `onChange` with a filtered array would look like a wholesale
   * replace, which deliberately does not record rejections. Falls back to the
   * filter-and-replace behaviour when not supplied.
   */
  onRemove?: ((chars: string[]) => void) | undefined;
}

function CharChipEditor({ chars, onChange, autoFocus = false, bcp47, onRemove }: CharChipEditorProps) {
  const { t, i18n } = useLingui();
  const glyphFontStack = useGlyphFontStack();
  const isCasedBase = useIsCasedBase();
  const { provenance, proposalConfidence, proposalRelease } = useInventoryDraft("characters");
  const [inputVal, setInputVal] = useState("");
  const [filterQuery, setFilterQuery] = useState("");
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
      devLog.info(
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
    // The fold itself sits behind the casing-facet gate (useIsCasedBase): on
    // a caseless base nothing folds — entries stay exactly as chosen.
    const folded = harvested.map((c) => {
      const cc = isCasedBase ? caseCounterpart(c, bcp47) : null;
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
  // NOT migrated to collateInventory: unlike collateInventory's single
  // concatenated return, this site needs `bareMarks` and `letters` (via
  // `displayLetters` below) as two SEPARATE arrays — each is rendered by its
  // own `.map()` with different per-chip logic (letters get the uppercase-
  // toggle companion chip; bare marks don't), and `unitCount` below sums
  // their lengths independently. `displayLetters` also runs `letters`
  // through `lowercaseBaseView` between the partition and the collate,
  // which collateInventory has no hook for.
  const linguisticChars = chars.filter(isLinguisticChar);
  const bareMarks = linguisticChars.filter(isCombiningMarkChar).sort(codePointCompare);
  const letters = linguisticChars.filter((c) => !isCombiningMarkChar(c));
  // Case-collapse the letters to their lowercase/caseless unit (FR-008/FR-010):
  // hide an uppercase only when its lowercase is actually present; a lowercase or
  // caseless (or uppercase-only) letter is shown as entered.
  // Single source of truth with the marks step (spec 049, FR-006).
  // Facet-gated (useIsCasedBase): a caseless base shows the letters exactly as
  // entered — no collapse, and no "Show uppercase" toggle below.
  const displayLetters = collate(isCasedBase ? lowercaseBaseView(letters, bcp47) : letters);
  // Count reflects the collapsed lowercase/caseless units + bare marks.
  const unitCount = displayLetters.length + bareMarks.length;
  // Clutter filter (issue 543): offered only for long inventories (see
  // INVENTORY_FILTER_THRESHOLD). Filtering is VIEW-ONLY — it narrows which
  // chips render, never `chars`, so the underlying inventory, provenance,
  // and the Done payload are untouched, and clearing the query restores the
  // full grid exactly. Matching reuses CharacterMapPane's predicate
  // (characterSearch.ts: glyph, code point, base letter), so the two search
  // boxes in this step behave the same way.
  const filterOffered = unitCount > INVENTORY_FILTER_THRESHOLD;
  const filterActive = filterOffered && filterQuery.trim() !== "";
  const visibleLetters = filterActive
    ? displayLetters.filter((c) => matchesQuery({ char: c }, filterQuery))
    : displayLetters;
  const visibleMarks = filterActive
    ? bareMarks.filter((c) => matchesQuery({ char: c }, filterQuery))
    : bareMarks;
  const visibleCount = visibleLetters.length + visibleMarks.length;
  // If removals shrink the inventory back under the threshold, the filter
  // control unmounts — clear the query with it, so regrowing the alphabet
  // later never re-applies a filter the author can no longer see.
  useEffect(() => {
    if (!filterOffered && filterQuery !== "") setFilterQuery("");
  }, [filterOffered, filterQuery]);
  const hasCasedLetter = isCasedBase && letters.some((b) => upperCounterpartOf(b, bcp47) !== null);
  // Distinct proposal attributions currently represented in the draft — the
  // legend names them rather than leaving the dashed outline to speak for itself.
  const proposedAttributions = [
    ...new Set(
      Object.values(provenance)
        .filter((o) => o !== "author")
        .map((o) => attributionText(o, proposalConfidence[o], i18n, proposalRelease[o])),
    ),
  ];

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
            message: "Type your alphabet (a b c …)",
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
          data-testid="charlist-add"
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
        {/* Legend — the dashed outline needs saying out loud once, so the
            distinction is not carried by colour/border alone (spec 044 P5). */}
        {proposedAttributions.length > 0 && (
          <p
            data-testid="proposed-chip-legend"
            style={{ margin: "0 0 8px 0", fontSize: 12, color: TEXT_DIM }}
          >
            <Trans id="survey.phaseB.charChipEditor.proposedLegend">
              Dashed characters were proposed for you ({{ sources: proposedAttributions.join("; ") }}).
              Remove any that are wrong.
            </Trans>
          </p>
        )}
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
        {/* Clutter filter (issue 543) — long inventories only. Enter inside
            the filter is swallowed (preventDefault + stopPropagation): this
            editor can sit inside an Enter-to-advance container
            (enterToAdvance.ts / SurveyRunner), and pressing Enter while
            filtering must neither advance the step nor add a character. */}
        {filterOffered && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "0 0 8px 0" }}>
            <input
              type="text"
              data-testid="alphabet-filter"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
              placeholder={t({
                id: "survey.phaseB.charChipEditor.filterPlaceholder",
                message: "Filter by character, code point (U+…), or base letter",
              })}
              aria-label={t({
                id: "survey.phaseB.charChipEditor.filterAriaLabel",
                message: "Filter your alphabet",
              })}
              style={{
                flex: 1,
                background: BG_PAGE,
                border: `1px solid ${BORDER}`,
                borderRadius: 6,
                color: TEXT_MAIN,
                fontSize: 14,
                fontFamily: FONT,
                padding: "6px 10px",
                boxSizing: "border-box",
              }}
            />
            {filterQuery !== "" && (
              <button
                type="button"
                data-testid="alphabet-filter-clear"
                onClick={() => setFilterQuery("")}
                style={{ ...secondaryButton, whiteSpace: "nowrap", padding: "4px 12px", fontSize: 12 }}
              >
                <Trans id="survey.phaseB.charChipEditor.filterClear">Show all</Trans>
              </button>
            )}
          </div>
        )}
        {filterActive && (
          <p
            role="status"
            data-testid="alphabet-filter-status"
            style={{ margin: "0 0 8px 0", fontSize: 12, color: TEXT_DIM }}
          >
            {t({
              id: "survey.phaseB.charChipEditor.filterStatus",
              message: `Showing ${{ visible: visibleCount }} of ${{ total: unitCount }} characters — filtering changes only what you see, not your alphabet.`,
            })}
          </p>
        )}
        {unitCount === 0 ? (
          <p style={mutedParaFlush}>
            <Trans id="survey.phaseB.charChipEditor.empty">
              No characters yet — type your whole alphabet above.
            </Trans>
          </p>
        ) : filterActive && visibleCount === 0 ? (
          <p style={mutedParaFlush} data-testid="alphabet-filter-no-match">
            <Trans id="survey.phaseB.charChipEditor.filterNoMatch">
              No characters match your filter.
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
            {visibleLetters.flatMap((c) => {
              // Removable chip for the lowercase/caseless (or uppercase-only)
              // letter. The charChip/chipGlyph booleans are FIXED literals
              // reproducing the original inline hex (unchecked shell + accent
              // glyph), not real checked state — do not wire them to a value.
              const { title } = codepointLabel(c);
              // Proposed-vs-authored (spec 044 FR-017 / obligation P5): a
              // proposed character is visually distinct and says where it came
              // from, so "confirm this alphabet" is a real decision rather than
              // a rubber stamp over an undifferentiated list.
              const origin = provenance[c];
              const isProposed = origin !== undefined && origin !== "author";
              const attribution = isProposed
                ? attributionText(origin, proposalConfidence[origin], i18n, proposalRelease[origin])
                : null;
              const cells = [
                <button
                  key={c}
                  type="button"
                  title={attribution === null ? title : `${title} — ${attribution}`}
                  data-testid={isProposed ? "proposed-char-chip" : "authored-char-chip"}
                  data-provenance={origin ?? "author"}
                  onClick={() => {
                    // Removing a letter removes BOTH cases (the inverse of the
                    // map, which adds both) — even the uppercase hidden by the
                    // case-collapse, so it never re-appears as an orphan chip.
                    // Facet-gated: on a caseless base the pair is just the
                    // letter itself — the author's other-case entry is a
                    // separate entry, not a pair member.
                    const pair = isCasedBase ? casePairOf(c, bcp47) : [c];
                    if (onRemove !== undefined) {
                      onRemove(pair);
                    } else {
                      const drop = new Set(pair);
                      onChange(chars.filter((x) => !drop.has(x)));
                    }
                  }}
                  aria-label={
                    attribution === null
                      ? t({
                          id: "survey.phaseB.charChipEditor.removeAriaLabel",
                          message: `Remove ${{ char: c }} (${{ cp: title }})`,
                        })
                      : t({
                          id: "survey.phaseB.charChipEditor.removeProposedAriaLabel",
                          message: `Remove ${{ char: c }} (${{ cp: title }}), proposed ${{ attribution }}`,
                        })
                  }
                  style={
                    isProposed
                      ? { ...charChip(false), borderStyle: "dashed", borderColor: ACCENT }
                      : charChip(false)
                  }
                >
                  <span style={chipGlyph(true, glyphFontStack)}>{displayChar(c)}</span>
                  <CpLabel grapheme={c} />
                  <span style={chipIndicator(ERROR_RED)}>x</span>
                </button>,
              ];
              // Derived uppercase (display-only) when the toggle is on — mirrors
              // the breakdown Letters section; not a removable pick. The
              // toggle itself only renders behind the casing gate, so the
              // derivation is gated here too.
              const upper = showUppercase && isCasedBase ? upperCounterpartOf(c, bcp47) : null;
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
            {visibleMarks.map((c) => {
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
// AlphabetBreakdown — the visible three-store decomposition (spec 071, US5)
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
  const { bases, marks, attestedStacks, numbers, punctuation, symbols, separators, controls, lastPick } =
    useInventoryDraft("characters");
  const [showUppercase, setShowUppercase] = useState(false);
  const glyphFontStack = useGlyphFontStack();
  const isCasedBase = useIsCasedBase();

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

  const justAddedBases = new Set(lastPick?.addedBases ?? []);
  const justAddedMarks = new Set(lastPick?.addedMarks ?? []);
  const justAddedStack =
    lastPick?.addedStack != null ? composeStack(lastPick.addedStack) : null;

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
        <span style={chipGlyph(true, glyphFontStack)}>{display}</span>
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
  // Single source of truth with the marks step (spec 049, FR-006).
  // Facet-gated (useIsCasedBase): a caseless base shows every base as
  // entered and gets no toggle — there is no case behaviour to reveal.
  // NOT migrated to collateInventory: `bases` is its own pre-partitioned
  // store category (marks live separately in `marks` below, rendered in
  // their own section) — there is no letters/bare-mark mix here to
  // partition, so a bare `collate()` is already the right call.
  const displayBases = collate(isCasedBase ? lowercaseBaseView(bases, bcp47) : bases);

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
            const u = showUppercase && isCasedBase ? upperCounterpartOf(b, bcp47) : null;
            const cells = [chip(b, b, justAddedBases.has(b))];
            if (u !== null) cells.push(chip(u, u, false));
            return cells;
          }),
          isCasedBase ? uppercaseToggle : undefined,
        )}
      {/* NOT migrated to collateInventory: `marks` is rendered in its OWN
          section, entirely separate from Letters — the exact "different
          reason" the audit calls out (marks-only display, not a combined
          letters+marks walk), so there is nothing here for collateInventory
          to partition. */}
      {marks.length > 0 &&
        section(
          "alphabet-marks",
          `Marks (${marks.length})`,
          "Accents and other marks that attach to a letter.",
          // Bare diacritics: raw code-point order, not ICU (spec 047 refinement).
          [...marks].sort(codePointCompare).map((m) => chip(m, prefixCombiningMark(m, true), justAddedMarks.has(m))),
        )}
      {/* NOT migrated: `attestedStacks` is already-composed accented letters
          (base+mark fused into one grapheme by composeStack) — no bare marks
          are ever present to partition out, so collate() alone is correct. */}
      {attestedStacks.length > 0 &&
        section(
          "alphabet-accented",
          `Accented letters (${attestedStacks.length})`,
          "Letter-plus-mark combinations your language uses.",
          collate(attestedStacks.map(composeStack)).map((composed) =>
            chip(composed, composed, justAddedStack === composed),
          ),
        )}
      {/* NOT migrated (numbers/punctuation/symbols below, and separators/
          controls further down): each is its own pre-partitioned,
          non-letter, non-mark store category rendered in its own section —
          none can contain a bare combining mark, so there is no
          letters-then-marks split to make and a bare collate() is already
          correct. */}
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
// LoanwordsSection — the exemplar AUXILIARY tier, offered but not selected
//
// A language's sources list some letters as loanword-only (Bafut's
// [c h ʼ p q v x]). Seeding takes the main tier only, so these are not in the
// alphabet — and they are not counted as needed anywhere else either (the
// engine's needed set leaves the auxiliary tier out). This section is where
// the author sees them and decides: each chip toggles the letter (with its
// case pair) in or out of the draft's `loanwordChars` — a list beside the
// alphabet, not in it. Done folds that list into `confirmedInventory`, so an
// added letter is needed, but the alphabet model never sees it: loanword
// letters are placed after the alphabet's own and labelled as loanwords. A
// letter the author leaves out stays surplus, so the convenience question
// and carve can ask about it later.
//
// Letters the main tier already carries (Bafut's h, via its {gh} cluster) are
// not repeated here. Adding is an authoring act, so removing one again is an
// edit, not a rejection of a proposal.
//
// Deliberately quieter than the main alphabet: these letters are not part of
// the language's own alphabet, only kept for borrowed words. A smaller heading
// and smaller chips say so without hiding them, and "Add all" makes accepting
// the whole tier one click.
// ---------------------------------------------------------------------------

/** Chip and glyph scale for the loanword chips: visibly secondary to the alphabet's own. */
const LOANWORD_CHIP_SCALE = 0.85;

function LoanwordsSection({ bcp47 }: { bcp47?: string | undefined }) {
  const { t } = useLingui();
  const { inventory } = useSourcedExemplars(bcp47);
  const draft = useInventoryDraft("characters");
  const chars = draft.chars;
  const loanwordChars = draft.loanwordChars;
  const addLoanword = draft.ops.addLoanword;
  const removeLoanword = draft.ops.removeLoanword;
  const remove = draft.ops.remove;
  const glyphFontStack = useGlyphFontStack();
  const isCasedBase = useIsCasedBase();

  const loanwords = useMemo(() => {
    if (inventory === null) return [];
    const main = new Set(charactersInTier(inventory, "main").map((c) => c.normalize("NFC")));
    return collate(
      nfcDedup([], charactersInTier(inventory, "auxiliary")).filter((c) => !main.has(c)),
    );
  }, [inventory]);

  if (loanwords.length === 0) return null;

  // A letter counts as added when it is a loanword letter OR the author has
  // already put it in the alphabet (typed it, or picked it in the map).
  const isAdded = (ch: string): boolean => loanwordChars.includes(ch) || chars.includes(ch);
  const allAdded = loanwords.every(isAdded);

  /**
   * Add or remove one loanword letter together with its case pair. Adding
   * goes to the loanword list; removing takes the letter out of whichever
   * list holds it, so the chip always reflects what the keyboard will type.
   * Facet-gated (useIsCasedBase): on a caseless base the "pair" is the
   * letter alone — a loanword letter is never auto-paired to an uppercase
   * the author didn't choose.
   */
  const setLetter = (ch: string, on: boolean): void => {
    for (const c of isCasedBase ? casePairOf(ch, bcp47) : [ch]) {
      const nfc = c.normalize("NFC");
      const state = getCharacterInventoryValue();
      if (on) addLoanword(nfc);
      else if (state.loanwordChars.includes(nfc)) removeLoanword(nfc);
      else if (state.chars.includes(nfc)) remove(nfc);
    }
  };

  return (
    <section
      data-testid="alphabet-loanwords"
      aria-labelledby="alphabet-loanwords-heading"
      style={{ display: "flex", flexDirection: "column", gap: 6 }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h3
          id="alphabet-loanwords-heading"
          style={{ margin: 0, fontSize: 13, fontWeight: 600, color: TEXT_DIM }}
        >
          {t({
            id: "survey.phaseB.loanwords.heading",
            message: `Loanword letters (${{ count: loanwords.length }})`,
          })}
        </h3>
        <button
          type="button"
          data-testid="alphabet-loanwords-toggle-all"
          onClick={() => {
            for (const ch of loanwords) setLetter(ch, !allAdded);
          }}
          className="ks-focus-ring ks-hit-target"
          style={{ ...secondaryButton, padding: "4px 12px", fontSize: 12 }}
        >
          {allAdded ? (
            <Trans id="survey.phaseB.loanwords.removeAll">Remove all loanword letters</Trans>
          ) : (
            <Trans id="survey.phaseB.loanwords.addAll">Add all loanword letters</Trans>
          )}
        </button>
      </div>
      <p style={{ ...mutedParaFlush, margin: 0, fontSize: 12 }}>
        <Trans id="survey.phaseB.loanwords.note">
          Your language&apos;s sources list these letters for borrowed words. They are not in
          your alphabet yet. Add any that your keyboard should type.
        </Trans>
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {loanwords.map((ch) => {
          const pair = isCasedBase ? casePairOf(ch, bcp47) : [ch];
          const selected = isAdded(ch);
          const letters = pair.join(" ");
          const { title } = codepointLabel(ch);
          return (
            <button
              key={ch}
              type="button"
              aria-pressed={selected}
              aria-label={t({
                id: "survey.phaseB.loanwords.chipAriaLabel",
                message: `${{ letters }} (${{ cp: title }})`,
              })}
              title={title}
              onClick={() => setLetter(ch, !selected)}
              className="ks-focus-ring ks-hit-target"
              style={charChip(selected, LOANWORD_CHIP_SCALE)}
            >
              <span style={chipGlyph(selected, glyphFontStack, LOANWORD_CHIP_SCALE)}>{letters}</span>
              <CpLabel grapheme={ch} />
              <span style={chipIndicator(chipIndicatorColor(selected), LOANWORD_CHIP_SCALE)}>
                {chipIndicatorText(selected)}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// BuildListView — unified "add your whole alphabet" method
//
// The alphabet accumulated here is shared with CharacterMapPane (the right-pane
// character map, rendered independently by StudioShell's SurveyView) via the
// character-inventory decision value (useInventoryDraft) — both panes toggle
// the SAME chars array. The lifecycle contract (reset on substage entry, not
// on every render) lives with the ops in survey/phaseBDraftOps.ts.
// ---------------------------------------------------------------------------

interface BuildListViewProps {
  context: SurveyContext;
  onComplete: (result: SurveyPhaseResult) => void;
  onBack: () => void;
}

function BuildListView({ context, onComplete, onBack }: BuildListViewProps) {
  const { t, i18n } = useLingui();
  const draft = useInventoryDraft("characters");
  const chars = draft.chars;
  const setAll = draft.ops.setAll;
  const provenance = draft.provenance;
  const exemplarDigraphs = draft.exemplarDigraphs;
  const loanwordChars = draft.loanwordChars;
  const removeChar = draft.ops.remove;
  const alphabetEvidenceKey = draft.alphabetEvidenceKey;

  // Defaults-first (spec 3c): the build list can be reached without passing
  // the intro chooser (a restored position, a progress-dot jump). If it opens
  // EMPTY while a sourced exemplar alphabet exists and the author never
  // declined it, apply the exemplar set, exactly as accepting the chooser's
  // pre-selected option would. Once per mount; seedFromProposal is
  // idempotent and never re-proposes a character the author removed.
  const { inventory: exemplarInventory } = useSourcedExemplars(context.bcp47_tag);
  const exemplarDeclined = draft.exemplarMethodDeclined;
  const seedExemplars = draft.ops.seedFromProposal;
  const autoSeededRef = useRef(false);
  useEffect(() => {
    if (autoSeededRef.current || exemplarInventory === null) return;
    autoSeededRef.current = true;
    if (chars.length === 0 && !exemplarDeclined) {
      seedExemplars(exemplarInventory, context.bcp47_tag);
    }
  }, [exemplarInventory, chars.length, exemplarDeclined, seedExemplars, context.bcp47_tag]);

  // spec 079 US3 T059/T080: carried-over additions that landed outside the
  // new script after a shape change, flagged until reconfirmed. Same
  // derivation `hooks/useWorkToDo.ts` reads for the journey-strip badge
  // (survey/characterFlags.ts), so the in-page cue and the badge can never
  // disagree.
  const charactersAnswers = useSurveyAnswerStore((s) => s.steps.characters?.answers);
  const saveCharacterAnswer = useSurveyAnswerStore((s) => s.saveAnswer);
  const flaggedAnswers = useMemo(
    () => deriveCharacterFlags(charactersAnswers ?? {}, alphabetEvidenceKey ?? ""),
    [charactersAnswers, alphabetEvidenceKey],
  );
  const flaggedWorkItems = useMemo(
    () =>
      flaggedAnswers.map((f) => ({
        kind: "reproposed" as const,
        stepId: "characters",
        screenId: f.screenId,
        answerId: f.answerId,
        reason: f.reason,
      })),
    [flaggedAnswers],
  );
  // Build-list is a single screen, so nothing ever precedes it — the shared
  // gate never blocks Done here; it is still used (rather than a bespoke
  // check) so there is exactly one gate implementation across every step
  // that surfaces flags (T080).
  const nextGate = useFlaggedNextGate(flaggedWorkItems, [CHARACTERS_BUILD_LIST_SCREEN_ID], CHARACTERS_BUILD_LIST_SCREEN_ID);
  const doneDisabled = buildListDoneDisabled(chars.length) || nextGate.blocked;
  const isCasedBase = useIsCasedBase();

  // Chip removal goes through the store's per-character remove(), not setAll,
  // so removing a PROPOSED character is recorded as a rejection and never
  // re-proposed (spec 044 FR-017). Removing an authored one records nothing.
  const removeChars = (toRemove: string[]): void => {
    for (const ch of toRemove) removeChar(ch);
  };

  // "Proposed" means a machine origin, not merely "the draft is non-empty" —
  // an author who typed their whole alphabet by hand has nothing to confirm.
  const hasProposedChars = Object.values(provenance).some((p) => p !== "author");

  function handleDone(): void {
    // spec 079 US3 T080/FR-041: re-stamp every flagged addition with the
    // CURRENT evidence key on Done -- the author has seen the alphabet (and this
    // cue) in full, so this is the confirm/keep action that clears the flag,
    // mirroring marks' station Next.
    restampFlaggedAdditions({
      answers: charactersAnswers,
      evidenceKey: alphabetEvidenceKey,
      saveAnswer: saveCharacterAnswer,
    });
    // Record both cases (spec 047 FR-009) behind the casing-facet gate
    // (useIsCasedBase); see buildListDoneResult.
    onComplete(
      buildListDoneResult({
        chars,
        loanwordChars,
        exemplarDigraphs,
        bcp47: context.bcp47_tag,
        isCasedBase,
      }),
    );
  }

  // Back / Continue render in the footer (spec 081); this screen is the step's
  // only publisher while it is shown.
  usePublishStepNav({
    back: {
      label: t({ id: "survey.phaseB.buildList.backButton", message: "Back" }),
      onClick: onBack,
      testId: "phase-b-back",
    },
    forward: {
      label: t({
        id: "survey.phaseB.buildList.doneButton",
        message: plural(chars.length, {
          one: "Continue (# character)",
          other: "Continue (# characters)",
        }),
      }),
      onClick: handleDone,
      testId: "charlist-done",
      disabled: doneDisabled,
    },
  });

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
      {/* Heading — swaps once something has been PROPOSED into the draft
          (spec 044 FR-016c): the author's job changes from producing an
          alphabet to checking one. The confirm action itself is unchanged, and
          a filled draft is NOT a completed step — Done still has to be pressed. */}
      <h2 style={phaseHeadingFlush} data-testid="phase-b-heading">
        {hasProposedChars ? (
          <Trans id="survey.phaseB.buildList.headingConfirm">Confirm your alphabet</Trans>
        ) : (
          <Trans id="survey.phaseB.buildList.heading">Add your whole alphabet</Trans>
        )}
      </h2>

      {/* Font selection lives in the NavBar now (#1895): the FontSwitcher
          control edits the same character-inventory selectedFont from every
          step, so this step no longer carries its own picker. */}

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
            character your language uses, not just the special ones. Type
            them in below, like this:
          </Trans>
        </p>
        <p style={{ margin: "8px 0 0 0", fontFamily: "monospace", fontSize: 15 }}>
          a b c d e ɛ ŋ ɔ …
        </p>
      </div>

      {/* Section 2: Type-in characters */}
      <section
        aria-label={t({ id: "survey.phaseB.buildList.typeSectionAriaLabel", message: "List your letters" })}
      >
        <h3 style={sectionHeading}>
          <Trans id="survey.phaseB.buildList.typeAlphabetHeading">List your letters</Trans>
        </h3>
        <p style={{ ...mutedParaFlush, margin: "0 0 12px 0" }}>
          <Trans id="survey.phaseB.buildList.typeAlphabetHelp">
            Type the rest of your alphabet here (for example: a b c ŋ ɛ), then
            press Enter or + Add.
          </Trans>
        </p>
        <CharChipEditor
          chars={chars}
          onChange={setAll}
          onRemove={removeChars}
          autoFocus={false}
          bcp47={context.bcp47_tag}
        />
      </section>

      {/* Section 2a: the exemplar loanword tier — shown, never pre-selected.
          Sits directly under the alphabet it extends, ahead of the other fill
          affordances and the breakdown. */}
      <LoanwordsSection bcp47={context.bcp47_tag} />

      {/* Section 2b: the other two ways to fill the alphabet. All three
          affordances stay present regardless of the page-1 choice (spec 044
          FR-016b / obligation P1b) — declining the offer must not remove a
          route back to it, and choosing it must not remove the manual routes. */}
      <ExemplarApplyAffordance context={context} />
      <TextSampleAffordance />
      <RefreshExemplarsAffordance bcp47={context.bcp47_tag} />

      {/* Section 3: visible three-store decomposition (spec 071 US5) + the
          spec-047 category sections — renders once the alphabet implies marks,
          accented letters, or any non-letter category. */}
      <AlphabetBreakdown bcp47={context.bcp47_tag} />

      {/* The character grid has moved to the right pane —
          see CharacterMapPane.tsx, rendered by StudioShell's SurveyView. */}

      {/* spec 079 US3 T080: flagged carried-over additions, with a cue per
          item plus the shared jump list. */}
      {flaggedAnswers.length > 0 && (
        <div role="status" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {flaggedAnswers.map((f) => (
            <p key={f.answerId} style={{ margin: 0, fontSize: 13, color: ERROR_RED }}>
              {reproposalCueMessage(f.reason, i18n)}
            </p>
          ))}
          <FlaggedAnswersList stepId="characters" items={flaggedWorkItems} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ExemplarApplyAffordance — the collapsed "exemplars available" route back
//
// Declining the offer on page 1 is a first-class choice, not a dead end: the
// proposed alphabet stays one click away here, collapsed so it does not nag
// (spec 044 FR-016b). Renders nothing when there is no inventory to apply, and
// nothing once the proposal has already been applied.
// ---------------------------------------------------------------------------

function ExemplarApplyAffordance({ context }: { context: SurveyContext }) {
  const { t } = useLingui();
  const { inventory } = useSourcedExemplars(context.bcp47_tag);
  const { provenance, ops: draftOps } = useInventoryDraft("characters");
  const seedFromProposal = draftOps.seedFromProposal;
  const [expanded, setExpanded] = useState(false);

  const alreadyApplied = Object.values(provenance).some(
    (p) => p === "cldr" || p === "sldr" || p === "cldr-live",
  );
  if (inventory === null || alreadyApplied) return null;

  return (
    <section
      data-testid="exemplar-apply-affordance"
      aria-label={t({
        id: "survey.phaseB.buildList.exemplarApplyAriaLabel",
        message: "Apply the exemplar alphabet",
      })}
    >
      <button
        type="button"
        data-testid="exemplar-apply-toggle"
        onClick={() => setExpanded((v) => !v)}
        className="ks-focus-ring ks-hit-target"
        style={{ ...secondaryButton, fontSize: 13 }}
        aria-expanded={expanded}
      >
        <Trans id="survey.phaseB.buildList.exemplarApplyToggle">
          Exemplars available for this language — show
        </Trans>
      </button>
      {expanded && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          <ExemplarOfferDetail inventory={inventory} />
          <div>
            <button
              type="button"
              data-testid="exemplar-apply-confirm"
              onClick={() => seedFromProposal(inventory, context.bcp47_tag)}
              className="ks-focus-ring ks-hit-target"
              style={primaryButton(false)}
            >
              <Trans id="survey.phaseB.buildList.exemplarApplyButton">
                Add these to my alphabet
              </Trans>
            </button>
          </div>
          <SldrUnionAction
            bcp47={context.bcp47_tag}
            currentInventory={inventory}
            seedFromProposal={seedFromProposal}
          />
        </div>
      )}
    </section>
  );
}

/**
 * The CLDR/SLDR union action (#1369).
 *
 * When the current exemplar offer is CLDR and the index also has an SLDR
 * side with characters CLDR doesn't cover, offers "Also add N characters
 * from SLDR". The SLDR characters union into the proposal via the same
 * seedFromProposal path (per-character source attribution is preserved),
 * and they arrive unticked — the author reviews them like any other
 * proposed character. Renders nothing when there's no SLDR side, when the
 * current offer is already SLDR, or while loading.
 */
function SldrUnionAction({
  bcp47,
  currentInventory,
  seedFromProposal,
}: {
  bcp47: string | undefined;
  currentInventory: SourcedInventory;
  seedFromProposal: (inventory: SourcedInventory, tag: string) => void;
}) {
  const { sldr, loading } = useSourcedExemplarsBoth(bcp47);
  const [added, setAdded] = useState(false);

  if (loading || added || bcp47 === undefined) return null;
  // Only when the current offer is the CLDR side and SLDR exists too.
  if (currentInventory.source !== "cldr" || sldr === null) return null;

  const cldrChars = new Set(currentInventory.characters.map((c) => c.char));
  const sldrExtra = sldr.characters.filter((c) => !cldrChars.has(c.char));
  if (sldrExtra.length === 0) return null;

  return (
    <div style={{ marginTop: 8 }}>
      <button
        type="button"
        data-testid="sldr-union-action"
        onClick={() => {
          seedFromProposal(sldr, bcp47);
          setAdded(true);
        }}
        className="ks-focus-ring ks-hit-target"
        style={{ ...secondaryButton, fontSize: 13 }}
      >
        <Trans id="survey.phaseB.buildList.sldrUnionButton">
          Also add {{ n: sldrExtra.length }} characters from SLDR
        </Trans>
      </button>
      <p style={{ margin: "4px 0 0", fontSize: 12, color: TEXT_DIM }}>
        <Trans id="survey.phaseB.buildList.sldrUnionHint">
          SLDR sometimes has characters CLDR omits. These arrive as a separate
          proposal — review them before keeping.
        </Trans>
      </p>
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
  const flow = useMemo(() => loadFlowSourceDef(flowSources["phase_b_characters"]!), []);
  // discoveryMethod lives in surveySessionStore (not component state) so
  // StudioShell's SurveyView can gate the right-pane character map on it —
  // the map only shows for the build-list path (see steps/manifest.ts's
  // rightPane:"character-map" on the characters step).
  const discoveryMethod = useSurveySessionStore((s) => s.discoveryMethod);
  const setDiscoveryMethod = useSurveySessionStore((s) => s.setDiscoveryMethod);
  // manualFlow is memoized here (before any early returns) to satisfy React's
  // rules of hooks — useMemo must not be called after a conditional return.
  const manualFlow = useMemo(() => makeManualOnlyFlow(flow), [flow]);

  // No position bookkeeping here (spec 079 T081): CharactersStep.tsx is the
  // single writer/restorer of this step's surveyAnswerStore position, driven
  // by watching this same `discoveryMethod` field. See the module comment
  // above.

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
    // Both the "use the exemplar set" and the plain "add your whole alphabet"
    // choices land here — page 2 is the same screen either way, prefilled or
    // empty (spec 044 obligations P1/P1a). Which one the author picked is
    // recorded durably in the draft store's provenance and
    // exemplarMethodDeclined, not in discoveryMethod, so the persisted survey
    // traversal and StudioShell's right-pane gating are untouched.
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
      // The manual path offers no loanword letters; clear any a previous
      // build-list run recorded (recordPhase merges per field).
      loanwordChars: [],
    });
  }

  // Manual path — use a patched flow that skips the intro question.
  // surveyPageColumn (epic #533), matching IdentityLite/FlowStepHost/Prefill's
  // outer column — SurveyRunner itself now always renders its question in the
  // shared card + the ghost-Back/spacer/primary nav row (SurveyRunner.tsx),
  // so this heading only needs to sit above it, not wrap it in a card.
  return (
    <div style={surveyPageColumn}>
      <h2 style={phaseHeading}>
        <Trans id="survey.phaseB.manual.heading">Character inventory</Trans>
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
  const { inventory, loading } = useSourcedExemplars(context.bcp47_tag);
  const introDraft = useInventoryDraft("characters");
  const seedFromProposal = introDraft.ops.seedFromProposal;
  const declineExemplarMethod = introDraft.ops.declineExemplarMethod;
  const declinedBefore = introDraft.exemplarMethodDeclined;
  // "intro" is never the step's final screen (build-list's Done and the
  // manual walk's last question both are, and each records through its own
  // path — R-04) — record its answer here, on its own Next (spec 079 T035).
  const recordQuestionAnswers = useRecordQuestionAnswers();

  // Defaults-first (spec §3c): when a sourced inventory exists it is the
  // pre-selected option — unless the author already declined it for this
  // working copy, in which case the decision is not re-asserted (FR-016a).
  const offerExemplars = inventory !== null;
  // The offer resolves asynchronously, so until the author picks something
  // the selection is DERIVED: the exemplar option whenever an offer exists
  // and was not declined, else "build-list". Deriving (rather than latching
  // once on the first settled lookup) means a late-arriving or re-resolved
  // offer still becomes the default. An explicit author choice always wins.
  const [authorChoice, setAuthorChoice] = useState<IntroChoice | null>(null);
  const selected: IntroChoice = resolveIntroSelection({ authorChoice, loading, offerExemplars, declinedBefore });
  const setSelected = setAuthorChoice;

  const languageName =
    context["language_name"] ?? context["detected_group"] ?? t({ id: "survey.phaseB.intro.genericLanguage", message: "your language" });

  const methods: Array<{ value: IntroChoice; label: string; detail?: ReactNode }> = [
    // Absent ENTIRELY when there is no inventory — not disabled, not empty
    // (obligation P2). The list then reverts to today's two options.
    ...(offerExemplars
      ? [
          {
            value: "exemplars" as IntroChoice,
            label: t({
              id: "survey.phaseB.intro.method.exemplars",
              message: "Start from the alphabet we already have for this language — you can change anything",
            }),
            detail: <ExemplarOfferDetail inventory={inventory} />,
          },
        ]
      : []),
    {
      value: "build-list",
      label: t({
        id: "survey.phaseB.intro.method.buildList",
        message: "Add your whole alphabet — type every character your language uses",
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

  function handleContinue(): void {
    continueFromIntro(selected, inventory, context.bcp47_tag, {
      record: recordQuestionAnswers,
      seedFromProposal,
      declineExemplarMethod,
      onChoose,
    });
  }

  // Back / Continue render in the footer (spec 081); this screen is the
  // step's only publisher while it is shown.
  usePublishStepNav({
    ...(onBack !== undefined
      ? {
          back: {
            label: t({ id: "survey.phaseB.intro.backButton", message: "Back" }),
            onClick: onBack,
            testId: "phase-b-intro-back",
          },
        }
      : {}),
    forward: {
      label: t({ id: "survey.phaseB.intro.continueButton", message: "Continue" }),
      onClick: handleContinue,
      testId: "charlist-continue",
    },
  });

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
        <Trans id="survey.phaseB.intro.heading">Character discovery</Trans>
      </h2>
      <p style={mutedParaFlush}>
        <Trans id="survey.phaseB.intro.question">How would you like to add the alphabet {languageName} uses?</Trans>
      </p>
      <p style={{ margin: 0, fontSize: 12, color: TEXT_DIM, lineHeight: 1.5 }}>
        <Trans id="survey.phaseB.intro.explanation">
          Both methods feed the same final alphabet.
          The first method lets you type your whole alphabet directly.
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
        onChange={(v) => setSelected(v as IntroChoice)}
        ariaLabelledby="discovery-method-label"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ExemplarOfferDetail — the offer's evidence, rendered INLINE on the option
//
// The author is being asked to accept a proposed alphabet, so what is being
// proposed has to be visible at the point of the decision, not one click away
// (obligation P2). Shows the source, its confidence, how many characters, and
// the actual main set.
//
// The character list is shown IN FULL and is never truncated — the author
// cannot confirm an alphabet they cannot see. Each character is a read-only
// card matching the chips on the build-list page (glyph + code-point label);
// a floating diacritic renders with the dotted circle (U+25CC) via displayChar
// so a bare combining mark is visible standalone, the same treatment as the
// breakdown and character-map pages.
// ---------------------------------------------------------------------------

function ExemplarOfferDetail({ inventory }: { inventory: ExemplarInventory }) {
  const glyphFontStack = useGlyphFontStack();
  const main = charactersInTier(inventory, "main");
  // ICU collation, matching the "Your alphabet" list and the breakdown
  // sections: letters (and letter+mark combos) by default ICU order; bare
  // combining marks have no meaningful dictionary position, so they sort by
  // raw code point and trail the letters (spec 047 refinement). `main` is a
  // single mixed list rendered as ONE ordered sequence (not split across
  // sections), which is exactly collateInventory's contract — migrated here
  // (spec 047 refinement / duplication cleanup) instead of hand-rolling the
  // same partition-then-sort.
  const ordered = collateInventory(main);

  return (
    <div
      data-testid="exemplar-offer-detail"
      style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}
    >
      <p style={{ margin: 0, fontSize: 12, color: TEXT_DIM }}>
        <ExemplarAttribution
          source={inventory.source}
          confidence={inventory.confidence}
          live={inventory.live}
          release={inventory.release}
        />{" "}
        <Trans id="survey.phaseB.intro.exemplars.count">
          {{ n: main.length }} characters
        </Trans>
      </p>
      <div
        data-testid="exemplar-offer-preview"
        style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
      >
        {ordered.map((c) => {
          const { title } = codepointLabel(c);
          return (
            <span
              key={c}
              title={title}
              aria-label={`${displayChar(c)} (${title})`}
              // Read-only VIEW card (not a toggle/remove button) — no pointer
              // cursor, matching AlphabetBreakdown's chips.
              style={{ ...charChip(false), cursor: "default" }}
            >
              <span style={chipGlyph(true, glyphFontStack)}>{displayChar(c)}</span>
              <CpLabel grapheme={c} />
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ExemplarAttribution — where a proposed character came from, and how sure
//
// Confidence drives WORDING ONLY and never filters (FR-017): most SLDR
// coverage is drafted or machine-generated, and hiding it would discard the
// languages this whole feature exists to reach. What it must do is tell the
// author when to look twice.
// ---------------------------------------------------------------------------

/** LDML draft statuses that are not human-confirmed — worth flagging. */
const UNCONFIRMED_CONFIDENCES = new Set([
  "generated",
  "suspect",
  "unconfirmed",
  "provisional",
  "tentative",
]);

// The attribution wordings as extractable descriptors.
//
// These MUST be `msg` macro descriptors rather than inline `t({ id, message })`
// objects: `attributionText` below receives the i18n instance as a PARAMETER,
// and the babel macro only rewrites `t(...)` where it can see the
// `useLingui()` binding in the same scope. An inline object there still
// renders correctly at runtime (it reaches `i18n._` and falls back to
// `message`), but the extractor never sees the id, so the string cannot be
// translated. Three of these were rescued
// by accident — `ExemplarAttribution` below repeats them as <Trans> under the
// same ids — but `fromText` has no component twin and was invisible to Crowdin.
const MSG_FROM_CLDR = msg({ id: "survey.phaseB.exemplars.fromCldr", message: "from CLDR" });
const MSG_FROM_CLDR_PINNED = msg({
  id: "survey.phaseB.exemplars.fromCldrPinned",
  message: "from CLDR {version}",
});
const MSG_FROM_CLDR_LIVE = msg({
  id: "survey.phaseB.exemplars.fromCldrLive",
  message: "from CLDR {version} (live refresh)",
});
const MSG_FROM_TEXT = msg({
  id: "survey.phaseB.exemplars.fromText",
  message: "from your text sample",
});
const MSG_FROM_SLDR_UNCONFIRMED = msg({
  id: "survey.phaseB.exemplars.fromSldrUnconfirmed",
  message: "from SLDR (machine-generated — please check)",
});
const MSG_FROM_SLDR = msg({ id: "survey.phaseB.exemplars.fromSldr", message: "from SLDR" });

/**
 * The same attribution as a plain string, for a `title` / `aria-label` where a
 * component cannot go. Kept beside `ExemplarAttribution` so the two wordings
 * cannot drift.
 */
function attributionText(
  source: string,
  confidence: string | undefined,
  i18n: ReturnType<typeof useLingui>["i18n"],
  release?: string,
): string {
  // Live-refreshed CLDR (#1367): the wording MUST name the fetched release
  // and say it was a live refresh — rendering it as plain "from CLDR" would
  // collapse exactly the pinned/unpinned distinction the feature exists to
  // keep visible. The release rides in the draft's proposalRelease, keyed
  // by this provenance, so it survives reload.
  //
  // Parameterized strings go through i18n._(id, values): the macro t()
  // accepts a descriptor but no values, while the I18n instance's id
  // overload does. The msg() descriptors above keep the ids extractable.
  if (source === "cldr-live") {
    return release !== undefined
      ? i18n._(MSG_FROM_CLDR_LIVE.id, { version: release })
      : i18n._(MSG_FROM_CLDR);
  }
  if (source === "cldr") {
    return release !== undefined
      ? i18n._(MSG_FROM_CLDR_PINNED.id, { version: release })
      : i18n._(MSG_FROM_CLDR);
  }
  if (source === "text") {
    return i18n._(MSG_FROM_TEXT);
  }
  if (confidence !== undefined && UNCONFIRMED_CONFIDENCES.has(confidence)) {
    return i18n._(MSG_FROM_SLDR_UNCONFIRMED);
  }
  return i18n._(MSG_FROM_SLDR);
}

function ExemplarAttribution({
  source,
  confidence,
  live,
  release,
}: {
  source: ExemplarSource;
  confidence: string;
  /** True for a live-refreshed inventory (#1367) — wording names the release. */
  live?: boolean | undefined;
  release?: string | undefined;
}) {
  if (source === "cldr" && live === true && release !== undefined) {
    return (
      <Trans id="survey.phaseB.exemplars.fromCldrLive">
        from CLDR {{ version: release }} (live refresh)
      </Trans>
    );
  }
  if (source === "cldr" && release !== undefined) {
    return (
      <Trans id="survey.phaseB.exemplars.fromCldrPinned">
        from CLDR {{ version: release }}
      </Trans>
    );
  }
  if (source === "cldr") {
    return <Trans id="survey.phaseB.exemplars.fromCldr">from CLDR</Trans>;
  }
  if (UNCONFIRMED_CONFIDENCES.has(confidence)) {
    return (
      <Trans id="survey.phaseB.exemplars.fromSldrUnconfirmed">
        from SLDR (machine-generated — please check)
      </Trans>
    );
  }
  return <Trans id="survey.phaseB.exemplars.fromSldr">from SLDR</Trans>;
}

// PunctuationStep — the "choose your punctuation" page.
//
// One spine EditorStep between "marks" and "convenience". A clone of the
// Phase B build-list ("add your whole alphabet") screen, scoped to
// PUNCTUATION — this is the dedicated page the character map's
// letters/numerals/marks fold points at (see CharacterMapPane.tsx's
// filteredGroups comment). The same affordances as the alphabet screen:
// sourced suggestions to tick, a type-in box, and the right-pane character
// map (StudioShell's SurveyView swaps it in via this step's
// rightPane:"character-map", scope "punctuation"). All three toggle the SAME
// shared phaseBDraftStore draft the alphabet screen used, so punctuation
// captured during Phase B arrives here pre-selected and map picks land in
// the same draft (its derived `punctuation` category is this page's list).
//
// On Done the step emits the draft's `punctuation` category as
// `confirmedInventory` on a phase:"C" result — NOT phase:"B": recordPhase
// shallow-merges same-phase entries field-wise ({...prev, ...result}), so a
// "B" result here would overwrite the alphabet step's confirmedInventory
// instead of unioning with it. The session-level mergePhaseResults union
// (deduped, first-appearance order) folds the two lists together; the phase
// label itself carries no routing weight (see convenienceResult's comment in
// ../convenience/ConvenienceCharsStep.tsx, the established precedent). No
// other phase-C producer writes confirmedInventory, so re-completing this
// step replaces only its own slice. Downstream, the merged inventory shields
// these characters from carve (useCarveNeededSet's non-alphabet slice) and
// puts any the base cannot yet type onto the placement worklist.
//
// Editors are pure (Article IV / G2): completion is reported via onComplete;
// the manifest reducer path (StepHost.handleComplete -> recordPhase) owns the
// session merge.

import { useMemo, useRef, useState, type ComponentType } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";
import { toUPlusNotation } from "@keyboard-studio/contracts";
import { glyphCategory } from "@keyboard-studio/engine";
import type { EditorStepProps } from "../../steps/types.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import { usePhaseBDraftStore } from "../../stores/phaseBDraftStore.ts";
import { useSourcedExemplars } from "../useSourcedExemplars.ts";
import { charactersInTier } from "../../lib/services.ts";
import { harvestChars } from "../charNormUtils.ts";
import { codepointLabel } from "../codepointLabel.ts";
import { useGlyphFontStack } from "../useGlyphFontStack.ts";
import {
  BG_PAGE,
  BORDER,
  ACCENT,
  TEXT_DIM,
  TEXT_MAIN,
  FONT,
  ERROR_RED,
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
  chipIndicatorColor,
  chipIndicatorText,
} from "../surveyStyles.ts";

/**
 * The step's phase result. `[]` records "asked, chose none" — the union merge
 * makes that a no-op at the session level, which is the correct reading: an
 * author who wants no extra punctuation has nothing to add to the inventory.
 * See the module header for why the label is "C" and never "B".
 */
function punctuationResult(punctuation: readonly string[]): SurveyPhaseResult {
  return { phase: "C", answers: [], confirmedInventory: [...punctuation] };
}

/** True for the one category this page collects. */
function isPunctuationChar(c: string): boolean {
  return glyphCategory(c) === "punctuation";
}

// ---------------------------------------------------------------------------
// SuggestedPunctuationChip — tick-to-add chip (mirrors PhaseB's SuggestionChip)
// ---------------------------------------------------------------------------

interface SuggestedChipProps {
  char: string;
  onAdd: (c: string) => void;
}

function SuggestedPunctuationChip({ char, onAdd }: SuggestedChipProps) {
  const { t } = useLingui();
  const glyphFontStack = useGlyphFontStack();
  const cp = toUPlusNotation(char);
  const actionLabel = t({ id: "survey.punctuation.suggestionChip.addAction", message: "Add" });
  return (
    <button
      type="button"
      onClick={() => onAdd(char)}
      aria-label={`${actionLabel} ${char} (${cp})`}
      aria-pressed={false}
      style={charChip(false)}
    >
      <span style={chipGlyph(false, glyphFontStack)}>{char}</span>
      <span style={chipCodepoint()}>{cp}</span>
      <span style={chipIndicator(chipIndicatorColor(false))}>{chipIndicatorText(false)}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// PunctuationStep
// ---------------------------------------------------------------------------

const PunctuationStep: ComponentType<EditorStepProps> = (
  { onComplete, onBack }: EditorStepProps,
) => {
  const { t } = useLingui();
  const glyphFontStack = useGlyphFontStack();
  const surveyContext = useSurveySessionStore((s) => s.surveyContext);
  const bcp47 = surveyContext.bcp47_tag;
  const languageName = surveyContext.language_name;

  const chars = usePhaseBDraftStore((s) => s.chars);
  const punctuation = usePhaseBDraftStore((s) => s.punctuation);
  const provenance = usePhaseBDraftStore((s) => s.provenance);
  const addChar = usePhaseBDraftStore((s) => s.add);
  const addProposed = usePhaseBDraftStore((s) => s.addProposed);
  const removeChar = usePhaseBDraftStore((s) => s.remove);

  const { inventory, loading } = useSourcedExemplars(bcp47);

  const [inputVal, setInputVal] = useState("");
  // Non-punctuation characters the type-in box declined, shown (not silently
  // dropped — §3c: no invisible failure) until the next add attempt.
  const [skipped, setSkipped] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  // Double-complete guard (mirrors ConvenienceCharsStep): Done advances the
  // manifest; a second click before unmount must not advance twice.
  const completedRef = useRef(false);

  const displayName =
    languageName ?? bcp47 ?? t({ id: "survey.punctuation.genericLanguage", message: "this language" });

  // What the exemplar source knows and the draft does not already hold. Like
  // the alphabet screen's SuggestionPanel, a ticked chip LEAVES this list and
  // reappears below in "Your punctuation", where removal lives — the panel is
  // add-only in practice.
  const offered = useMemo(() => {
    if (inventory === null) return [];
    return charactersInTier(inventory, "punctuation")
      .map((c) => c.normalize("NFC"))
      .filter((c) => !chars.includes(c));
  }, [inventory, chars]);

  function add(): void {
    const { chars: harvested } = harvestChars(inputVal);
    if (harvested.length === 0) return;
    // This page collects one category. Anything else typed here is declined
    // visibly (the note below) rather than silently vanishing into the shared
    // draft — a letter added here would resurface in the Phase B alphabet.
    const punct = harvested.filter(isPunctuationChar);
    setSkipped(harvested.filter((c) => !isPunctuationChar(c)));
    for (const c of punct) addChar(c);
    setInputVal("");
    inputRef.current?.focus();
  }

  function complete(): void {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete(punctuationResult(punctuation));
  }

  const addDisabled = inputVal.trim() === "";

  return (
    <div
      data-testid="punctuation-step"
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
      {onBack !== undefined && (
        <button
          type="button"
          data-testid="punctuation-back"
          onClick={onBack}
          style={{ alignSelf: "flex-start", ...secondaryButton }}
        >
          <Trans id="survey.punctuation.backButton">Back</Trans>
        </button>
      )}

      <h2 style={phaseHeadingFlush} data-testid="punctuation-heading">
        <Trans id="survey.punctuation.heading">Choose your punctuation</Trans>
      </h2>

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
          <Trans id="survey.punctuation.instructions">
            Add the <strong>punctuation your language uses</strong> — tick the
            suggested marks below, type any that are missing, or browse the
            character map on the right, like this:
          </Trans>
        </p>
        <p style={{ margin: "8px 0 0 0", fontFamily: "monospace", fontSize: 15 }}>
          . , ; ! ? « » …
        </p>
      </div>

      {/* Section 1: suggested punctuation from the sourced exemplars */}
      <section
        aria-label={t({
          id: "survey.punctuation.suggestedSectionAriaLabel",
          message: "Suggested punctuation",
        })}
      >
        <h3 style={sectionHeading}>
          <Trans id="survey.punctuation.suggestedHeading">Suggested punctuation</Trans>
        </h3>
        {loading ? (
          <div style={mutedNote}>
            <Trans id="survey.punctuation.suggestionsLoading">
              Checking for suggested punctuation…
            </Trans>
          </div>
        ) : inventory === null || charactersInTier(inventory, "punctuation").length === 0 ? (
          <div style={mutedNote}>
            <Trans id="survey.punctuation.noSuggestions">
              No suggested punctuation for {displayName}. Add your own below.
            </Trans>
          </div>
        ) : offered.length === 0 ? (
          <div style={mutedNote}>
            <Trans id="survey.punctuation.allSuggestionsAdded">
              Every suggested punctuation mark is already in your list below.
            </Trans>
          </div>
        ) : (
          <div>
            <p style={{ margin: "0 0 10px 0", fontSize: 11, color: TEXT_DIM }}>
              <Trans id="survey.punctuation.fromExemplars">
                from CLDR exemplars for {displayName} — tick to add
              </Trans>
            </p>
            <div
              role="group"
              aria-label={t({
                id: "survey.punctuation.suggestedGroupAriaLabel",
                message: "Suggested punctuation — tick to add",
              })}
              style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
            >
              {offered.map((c) => (
                <SuggestedPunctuationChip
                  key={c}
                  char={c}
                  onAdd={(ch) => addProposed(ch, inventory.source)}
                />
              ))}
            </div>
          </div>
        )}
      </section>

      <hr style={divider} />

      {/* Section 2: type-in */}
      <section
        aria-label={t({
          id: "survey.punctuation.typeSectionAriaLabel",
          message: "Type your punctuation",
        })}
      >
        <h3 style={sectionHeading}>
          <Trans id="survey.punctuation.typeHeading">Type your punctuation</Trans>
        </h3>
        <p style={{ ...mutedParaFlush, margin: "0 0 12px 0" }}>
          <Trans id="survey.punctuation.typeHelp">
            Type any punctuation marks that are missing (for example: ! ? « »),
            then press Enter or + Add.
          </Trans>
        </p>
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
              id: "survey.punctuation.inputPlaceholder",
              message: "Type punctuation (. , ; ! ? …)",
            })}
            aria-label={t({
              id: "survey.punctuation.inputAriaLabel",
              message: "Punctuation to add",
            })}
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
            <Trans id="survey.punctuation.addButton">+ Add</Trans>
          </button>
        </div>
        {skipped.length > 0 && (
          <p role="status" style={{ ...mutedParaFlush, margin: "8px 0 0 0" }}>
            <Trans id="survey.punctuation.skippedNote">
              Skipped {skipped.join(" ")} — only punctuation is collected here;
              letters and other characters belong to the earlier alphabet page.
            </Trans>
          </p>
        )}
      </section>

      {/* Section 3: the accumulated list */}
      <section
        aria-label={t({
          id: "survey.punctuation.listSectionAriaLabel",
          message: "Your punctuation",
        })}
      >
        <p style={{ margin: "0 0 8px 0", fontSize: 13, fontWeight: 600, color: TEXT_MAIN }}>
          <Trans id="survey.punctuation.listCount">Your punctuation ({punctuation.length})</Trans>
        </p>
        {punctuation.length === 0 ? (
          <p style={mutedParaFlush}>
            <Trans id="survey.punctuation.emptyList">
              No punctuation yet — tick a suggestion, type above, or browse the
              character map on the right.
            </Trans>
          </p>
        ) : (
          <div
            role="group"
            aria-label={t({
              id: "survey.punctuation.listGroupAriaLabel",
              message: "Chosen punctuation — click to remove",
            })}
            style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
          >
            {punctuation.map((c) => {
              const { title } = codepointLabel(c);
              // Proposed-vs-authored, mirroring the alphabet chips (spec 044
              // P5): a ticked suggestion keeps its dashed attribution so
              // confirming the list is a real decision.
              const isProposed = provenance[c] !== undefined && provenance[c] !== "author";
              return (
                <button
                  key={c}
                  type="button"
                  title={title}
                  data-testid={isProposed ? "proposed-punctuation-chip" : "authored-punctuation-chip"}
                  onClick={() => removeChar(c)}
                  aria-label={t({
                    id: "survey.punctuation.removeAriaLabel",
                    message: `Remove ${{ char: c }} (${{ cp: title }})`,
                  })}
                  style={
                    isProposed
                      ? { ...charChip(false), borderStyle: "dashed", borderColor: ACCENT }
                      : charChip(false)
                  }
                >
                  <span style={chipGlyph(true, glyphFontStack)}>{c}</span>
                  <span style={chipCodepoint()}>{codepointLabel(c).base}</span>
                  <span style={chipIndicator(ERROR_RED)}>x</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Footer: Done — always enabled; zero punctuation is a valid answer. */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          data-testid="punctuation-done"
          onClick={complete}
          className="ks-focus-ring ks-hit-target"
          style={primaryButton(false)}
        >
          {punctuation.length === 0
            ? t({ id: "survey.punctuation.doneButtonNone", message: "Continue without punctuation" })
            : t({
                id: "survey.punctuation.doneButton",
                message: plural(punctuation.length, {
                  one: "Done (# mark)",
                  other: "Done (# marks)",
                }),
              })}
        </button>
      </div>
    </div>
  );
};

export { PunctuationStep };

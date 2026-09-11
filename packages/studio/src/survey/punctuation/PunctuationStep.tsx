// PunctuationStep — the "choose your punctuation" page.
//
// One spine EditorStep between "marks" and "convenience". A clone of the
// Phase B build-list ("add your whole alphabet") screen, scoped to
// PUNCTUATION — this is the dedicated page the character map's
// letters/numerals/marks fold points at (see CharacterMapPane.tsx's
// filteredGroups comment). Affordances: the sourced punctuation tier is added
// FOR the author on arrival (see autoProposed below — "automatically add CLDR
// punctuation, don't make the user click each"), plus a type-in box and the
// right-pane character map (StudioShell's SurveyView swaps it in via this
// step's rightPane:"character-map", scope "punctuation"). All three toggle the SAME
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

import { useEffect, useRef, useState, type ComponentType } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";
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

  // Whether the draft ALREADY held punctuation when this step mounted: a
  // returning author (Phase-B leftovers, map picks, an earlier visit to this
  // page) has work here already, and auto-proposing over it would bury their
  // list under the source's. Read once, at mount, so the auto-add this render
  // pass is about to perform cannot flip it.
  const hadPriorPunctuationRef = useRef(punctuation.length > 0);
  // The resolved tag already auto-proposed for, so re-renders and a hook
  // re-resolve of the SAME tag do not re-run the seed.
  const seededTagRef = useRef<string | null>(null);

  // Auto-add the sourced punctuation tier on first arrival for a resolved tag
  // (Matt: "automatically add CLDR punctuation, don't make the user click
  // each"). The author's job here is to CONFIRM — press Done — and to remove
  // whatever their language does not use.
  //
  // Removal sticks, and the store is what makes it stick: `remove()` files a
  // proposed character into `rejected`, and `addProposed` refuses to resurrect
  // anything listed there (see phaseBDraftStore's addWithProvenance). So this
  // effect needs no rejection bookkeeping of its own and cannot fight the
  // author — re-running it is a no-op for every character they took out. That
  // record outlives the store's reset() by design, so it also survives a
  // remount of this step.
  useEffect(() => {
    if (loading || inventory === null) return;
    if (hadPriorPunctuationRef.current) return;
    const tag = bcp47 ?? "";
    if (seededTagRef.current === tag) return;
    seededTagRef.current = tag;
    for (const c of charactersInTier(inventory, "punctuation")) {
      const nfc = c.normalize("NFC");
      // One category, same filter the type-in path applies: a tier character
      // that is not punctuation would land in the shared draft WITHOUT showing
      // up in the list below (which renders the derived `punctuation`
      // category), and resurface in the Phase B alphabet — an invisible add,
      // which is worse now that no click precedes it.
      if (isPunctuationChar(nfc)) addProposed(nfc, inventory.source);
    }
  }, [loading, inventory, bcp47, addProposed]);

  // How much of the current list arrived as a proposal rather than from the
  // author — drives the "these were added for you" hint.
  const proposedCount = punctuation.filter(
    (c) => provenance[c] !== undefined && provenance[c] !== "author",
  ).length;

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
            Confirm the <strong>punctuation your language uses</strong> — the
            marks CLDR lists for it are already in your list below. Type any
            that are missing, take out any it does not use, and use the
            character map on the right for one-offs, like this:
          </Trans>
        </p>
        <p style={{ margin: "8px 0 0 0", fontFamily: "monospace", fontSize: 15 }}>
          . , ; ! ? « » …
        </p>
      </div>

      {/* Section 1: type-in */}
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

      <hr style={divider} />

      {/* Section 2: the accumulated list — auto-proposed marks land here */}
      <section
        aria-label={t({
          id: "survey.punctuation.listSectionAriaLabel",
          message: "Your punctuation",
        })}
      >
        <p style={{ margin: "0 0 8px 0", fontSize: 13, fontWeight: 600, color: TEXT_MAIN }}>
          <Trans id="survey.punctuation.listCount">Your punctuation ({punctuation.length})</Trans>
        </p>
        {/* Where the list came from, and that these marks are already chosen.
            Only while a proposal is actually in it — an author who removed the
            lot, or whose language the sources do not cover, is not told about
            marks that are not on screen. */}
        {loading ? (
          <p style={{ ...mutedNote, margin: "0 0 10px 0" }}>
            <Trans id="survey.punctuation.suggestionsLoading">
              Adding the suggested punctuation for {displayName}…
            </Trans>
          </p>
        ) : proposedCount > 0 ? (
          <p style={{ margin: "0 0 10px 0", fontSize: 11, color: TEXT_DIM }}>
            <Trans id="survey.punctuation.autoAddedHint">
              These marks came from CLDR exemplars for {displayName} and are
              already in your list. Click any your language does not use to take
              it out; it will not come back.
            </Trans>
          </p>
        ) : inventory === null || charactersInTier(inventory, "punctuation").length === 0 ? (
          <p style={{ ...mutedNote, margin: "0 0 10px 0" }}>
            <Trans id="survey.punctuation.noSuggestions">
              No suggested punctuation for {displayName}. Type any marks it uses
              above, or browse the character map on the right.
            </Trans>
          </p>
        ) : null}
        {punctuation.length === 0 ? (
          <p style={mutedParaFlush}>
            <Trans id="survey.punctuation.emptyList">
              No punctuation yet — type above, or browse the character map on
              the right.
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
              // Provenance drives the testid ONLY — never the styling (#1760).
              // An auto-added mark IS in the author's list, so it draws the same
              // selected shell and "[x]" indicator the character map uses for a
              // chosen cell. The earlier dashed border + red "x" read as "queued
              // for deletion" on a list that was in fact already correct. The
              // provenance VALUE is untouched: phaseBDraftStore's remove() files
              // a non-"author" origin into the sticky `rejected` list, which is
              // what keeps a removed mark removed.
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
                  style={charChip(true)}
                >
                  <span style={chipGlyph(true, glyphFontStack)}>{c}</span>
                  <span style={chipCodepoint()}>{codepointLabel(c).base}</span>
                  <span style={chipIndicator(chipIndicatorColor(true))}>
                    {chipIndicatorText(true)}
                  </span>
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

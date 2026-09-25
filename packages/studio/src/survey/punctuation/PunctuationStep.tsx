// PunctuationStep — the "choose your punctuation" page.
//
// One spine EditorStep between "marks" and "invisibles". A clone of the
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
// Defaults are the product (spec v1.3.1 §3c; spec 075): the list is NOT empty
// on arrival. When the sourced exemplars settle, the locale's whole
// punctuation tier is seeded as PROPOSED picks (`seedProposals`, once per
// resolved locale), each chip carrying its source so confirming is a real
// decision, and Done with zero clicks confirms the tier. An author who
// already confirmed a punctuation inventory before this shipped is neither
// overwritten nor extended (FR-023). Removing a chip records a rejection the
// seed never undoes (FR-022); typing the character back by hand overrides it.
//
// On Done the step emits the phase-C confirmed inventory — the draft's
// `punctuation` category unioned with every invisible character the author
// accepted on the next step, via the shared `phaseCConfirmedInventory()` —
// on a phase:"C" result, NOT phase:"B": recordPhase shallow-merges same-phase
// entries field-wise ({...prev, ...result}), so a "B" result here would
// overwrite the alphabet step's confirmedInventory instead of unioning with
// it. The session-level mergePhaseResults union (deduped, first-appearance
// order) folds the two lists together; the phase label itself carries no
// routing weight (see convenienceResult's comment in
// ../convenience/ConvenienceCharsStep.tsx, the established precedent). The
// invisibles step is the only other phase-C confirmedInventory producer, and
// it emits the SAME union, so whichever completes last the slice is whole
// (FR-024; see ../phaseCInventory.ts). Downstream, the merged inventory
// shields these characters from carve (useCarveNeededSet's non-alphabet
// slice) and puts any the base cannot yet type onto the placement worklist.
//
// Editors are pure (Article IV / G2): completion is reported via onComplete;
// the manifest reducer path (StepHost.handleComplete -> recordPhase) owns the
// session merge.

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import type { InventoryChar, SurveyPhaseResult } from "@keyboard-studio/contracts";
import { toUPlusNotation } from "@keyboard-studio/contracts";
import {
  basePunctuationCoverage,
  buildPunctuationProposal,
  computeInventoryDelta,
  glyphCategory,
} from "@keyboard-studio/engine";
import type { EditorStepProps } from "../../steps/types.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { usePhaseBDraftStore, type DraftProvenance } from "../../stores/phaseBDraftStore.ts";
import { useSurveyAnswerStore } from "../../stores/surveyAnswerStore.ts";
import { punctuationKey } from "../../steps/evidence.ts";
import { derivePunctuationFlags } from "./punctuationFlags.ts";
import { useFlaggedNextGate } from "../../hooks/useFlaggedNextGate.ts";
import { reproposalCueMessage } from "../reproposalReason.ts";
import { FlaggedAnswersList } from "../../components/FlaggedAnswersList.tsx";
import { useSourcedExemplars } from "../useSourcedExemplars.ts";
import { charactersInTier } from "../../lib/services.ts";
import { containsFormatChar, harvestChars, isFormatChar } from "../charNormUtils.ts";
import { codepointLabel } from "../codepointLabel.ts";
import { phaseCConfirmedInventory } from "../phaseCInventory.ts";
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
 * See the module header for why the label is "C" and never "B", and why the
 * inventory is the shared phase-C union rather than this page's slice alone.
 */
/** Manifest step id — matches steps/manifest.ts's "punctuation" entry. */
const PUNCTUATION_STEP_ID = "punctuation";

/**
 * The saved answer that carries the evidence key the confirmed inventory was
 * built on (spec 079 R-07, FR-022). The inventory itself stays where it always
 * was (the shared draft + the phase-C result); this answer records only what
 * it was confirmed FOR, so the FR-023 guard can tell "confirmed here" from
 * "confirmed for another language or base".
 */
const PUNCTUATION_INVENTORY_ANSWER_ID = "punctuation.inventory";

function punctuationResult(): SurveyPhaseResult {
  return { phase: "C", answers: [], confirmedInventory: phaseCConfirmedInventory() };
}

/** True for the one category this page collects. */
function isPunctuationChar(c: string): boolean {
  return glyphCategory(c) === "punctuation";
}

/** The separators the type-in box treats as "nothing typed" — mirrors harvestChars' skip set. */
const ASCII_WHITESPACE: ReadonlySet<string> = new Set([" ", "\t", "\r", "\n"]);

/** The exemplar-sourced provenances — what the CLDR group is made of. */
function isExemplarProvenance(p: DraftProvenance | undefined): boolean {
  return p === "cldr" || p === "sldr";
}

/** The base-derived provenances — what the base group is made of. */
function isBaseProvenance(p: DraftProvenance | undefined): boolean {
  return p === "base" || p === "ascii-floor";
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
  return (
    <button
      type="button"
      onClick={() => onAdd(char)}
      aria-label={t({
        id: "survey.punctuation.suggestionChip.addAriaLabel",
        message: `Add ${{ char }} (${{ cp }})`,
      })}
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
// ChosenChip — click-to-remove chip in the accumulated list
// ---------------------------------------------------------------------------

interface ChosenChipProps {
  char: string;
  /** Proposed-vs-authored, mirroring the alphabet chips (spec 044 P5). */
  isProposed: boolean;
  /**
   * A CLDR-group character the base ALSO produces (SC-003): shown once, here,
   * with the second attribution derived at render — provenance stays
   * single-valued in the store.
   */
  alsoBase?: boolean;
  onRemove: (c: string) => void;
}

function ChosenChip({ char, isProposed, alsoBase = false, onRemove }: ChosenChipProps) {
  const { t } = useLingui();
  const glyphFontStack = useGlyphFontStack();
  const { title, base } = codepointLabel(char);
  return (
    <button
      type="button"
      title={title}
      data-testid={isProposed ? "proposed-punctuation-chip" : "authored-punctuation-chip"}
      onClick={() => onRemove(char)}
      aria-label={
        alsoBase
          ? t({
              id: "survey.punctuation.removeAlsoBaseAriaLabel",
              message: `Remove ${{ char }} (${{ cp: title }}) — also produced by the base keyboard`,
            })
          : t({
              id: "survey.punctuation.removeAriaLabel",
              message: `Remove ${{ char }} (${{ cp: title }})`,
            })
      }
      style={
        isProposed
          ? { ...charChip(false), borderStyle: "dashed", borderColor: ACCENT }
          : charChip(false)
      }
    >
      <span style={chipGlyph(true, glyphFontStack)}>{char}</span>
      <span style={chipCodepoint()}>{base}</span>
      {alsoBase && (
        <span style={{ fontSize: 9, color: TEXT_DIM }} aria-hidden="true">
          <Trans id="survey.punctuation.alsoBaseBadge">base</Trans>
        </span>
      )}
      <span style={chipIndicator(ERROR_RED)}>x</span>
    </button>
  );
}

const chipRow = { display: "flex", flexWrap: "wrap", gap: 8 } as const;
const groupCaption = { margin: "0 0 8px 0", fontSize: 11, color: TEXT_DIM } as const;

// ---------------------------------------------------------------------------
// PunctuationStep
// ---------------------------------------------------------------------------

const PunctuationStep: ComponentType<EditorStepProps> = (
  { onComplete, onBack }: EditorStepProps,
) => {
  const { t, i18n } = useLingui();
  const surveyContext = useSurveySessionStore((s) => s.surveyContext);
  const bcp47 = surveyContext.bcp47_tag;
  const languageName = surveyContext.language_name;

  const chars = usePhaseBDraftStore((s) => s.chars);
  const punctuation = usePhaseBDraftStore((s) => s.punctuation);
  const provenance = usePhaseBDraftStore((s) => s.provenance);
  const rejected = usePhaseBDraftStore((s) => s.rejected);
  const addChar = usePhaseBDraftStore((s) => s.add);
  const addProposed = usePhaseBDraftStore((s) => s.addProposed);
  const removeChar = usePhaseBDraftStore((s) => s.remove);
  const seedProposals = usePhaseBDraftStore((s) => s.seedProposals);
  const acceptInvisible = usePhaseBDraftStore((s) => s.acceptInvisible);

  const phaseResults = useWorkingCopyStore((s) => s.phaseResults);
  const confirmedForKey = useSurveyAnswerStore(
    (s) => s.steps[PUNCTUATION_STEP_ID]?.answers[PUNCTUATION_INVENTORY_ANSWER_ID]?.evidenceKey,
  );
  const punctuationInventoryAnswer = useSurveyAnswerStore(
    (s) => s.steps[PUNCTUATION_STEP_ID]?.answers[PUNCTUATION_INVENTORY_ANSWER_ID],
  );
  const saveAnswer = useSurveyAnswerStore((s) => s.saveAnswer);

  const { inventory, loading } = useSourcedExemplars(bcp47);

  // Base coverage (US2): what the working copy already types, and whether that
  // list can be trusted. `null` only when there is no working copy at all —
  // then nothing is proposed from the base; the ASCII floor is a fallback for a
  // base whose output is UNKNOWABLE (opaque fragments), not for a missing one.
  const ir = useWorkingCopyStore((s) => s.ir);
  const baseKeyboard = useWorkingCopyStore((s) => s.baseKeyboard);
  const baseCoverage = useMemo(() => (ir === null ? null : basePunctuationCoverage(ir)), [ir]);
  const baseCoverageIncomplete = baseCoverage === null || !baseCoverage.coverageComplete;

  const evidenceKey = punctuationKey(inventory?.resolvedTag, baseKeyboard?.id);

  // FR-023: a phase-C confirmedInventory already on the session means the
  // author confirmed this step (possibly before proposals existed). Their
  // decision stands — nothing is seeded on top of it — but only for the
  // evidence it was confirmed on (spec 079 FR-022): after a language or base
  // change the defaults are proposed again. A confirmation with no recorded
  // key predates spec 079 and is honoured as before.
  const alreadyConfirmed = useMemo(
    () =>
      phaseResults.some((p) => p.phase === "C" && p.confirmedInventory !== undefined) &&
      (confirmedForKey === undefined || confirmedForKey === null || confirmedForKey === evidenceKey),
    [phaseResults, confirmedForKey, evidenceKey],
  );

  // spec 079 US3 T079/T080: the SAME derivation `hooks/useWorkToDo.ts` reads
  // for the journey-strip badge (survey/punctuation/punctuationFlags.ts), so
  // the in-page cue and the badge can never disagree.
  const flaggedAnswers = useMemo(
    () => derivePunctuationFlags(punctuationInventoryAnswer, evidenceKey),
    [punctuationInventoryAnswer, evidenceKey],
  );
  const flaggedWorkItems = useMemo(
    () =>
      flaggedAnswers.map((f) => ({
        kind: "reproposed" as const,
        stepId: PUNCTUATION_STEP_ID,
        screenId: f.screenId,
        answerId: f.answerId,
        reason: f.reason,
      })),
    [flaggedAnswers],
  );
  // Punctuation is a single screen, so nothing ever precedes it — the shared
  // gate never blocks Done here; used anyway so there is exactly one gate
  // implementation across every step that surfaces flags (T080).
  const nextGate = useFlaggedNextGate(flaggedWorkItems, [PUNCTUATION_STEP_ID], PUNCTUATION_STEP_ID);

  const [inputVal, setInputVal] = useState("");
  // Non-punctuation characters the type-in box declined, shown (not silently
  // dropped — §3c: no invisible failure) until the next add attempt.
  const [skipped, setSkipped] = useState<string[]>([]);
  // Format characters the type-in box handed to the invisibles step (FR-016),
  // and clusters declined because they contain one (FR-021) — both announced,
  // never silently dropped (FR-025).
  const [handedOff, setHandedOff] = useState<string[]>([]);
  const [declinedClusters, setDeclinedClusters] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  // Double-complete guard (mirrors ConvenienceCharsStep): Done advances the
  // manifest; a second click before unmount must not advance twice.
  const completedRef = useRef(false);

  const displayName =
    languageName ?? bcp47 ?? t({ id: "survey.punctuation.genericLanguage", message: "this language" });

  const tier = useMemo(
    () => (inventory === null ? [] : charactersInTier(inventory, "punctuation").map((c) => c.normalize("NFC"))),
    [inventory],
  );

  // Seed the CLDR/SLDR tier ONCE per resolved locale when the lookup settles
  // (FR-001). `seedProposals` is a no-op on a repeated key, honours the
  // author's rejections (FR-022) and never downgrades an author pick (FR-005).
  // Under the FR-023 guard the key is still recorded, with nothing to seed,
  // so the guard is evaluated once rather than on every visit.
  useEffect(() => {
    if (loading || inventory === null) return;
    const seedKey = "punctuation:" + inventory.resolvedTag;
    seedProposals(alreadyConfirmed ? [] : tier, inventory.source, seedKey);
  }, [loading, inventory, tier, alreadyConfirmed, seedProposals]);

  // Seed the base group ONCE per base keyboard, after the exemplar lookup has
  // settled so the group already excludes the CLDR tier (FR-006). The two
  // proposed groups are disjoint by construction: the base group is what the
  // base produces MINUS the CLDR group, the rejections and the author's own
  // picks (FR-010), derived from the inventory rather than the seeded draft so
  // it is the same whichever seed fires first. One-way floor rule
  // (FR-007..FR-009): the builder substitutes the ASCII floor when the base's
  // output is not fully known, and the provenance says which it was.
  //
  // The rejection ledger and the author's picks are read from the store WHEN
  // the effect fires rather than subscribed to: subscribing would re-run this
  // on every provenance change (including the CLDR seed's own writes) for no
  // purpose, since the seed key makes every re-run a no-op anyway.
  useEffect(() => {
    if (loading || baseCoverage === null) return;
    const seedKey = "punctuation-base:" + (baseKeyboard?.id ?? "working-copy");
    const draft = usePhaseBDraftStore.getState();
    const proposal = buildPunctuationProposal({
      exemplars: inventory,
      baseCoverage,
      rejected: new Set(draft.rejected),
      authorChosen: new Set(Object.keys(draft.provenance).filter((c) => draft.provenance[c] === "author")),
    });
    // This page collects Unicode PUNCTUATION only, so the floor's nine symbol
    // members ($ + < = > ^ ` | ~) are not proposed here: they would land in
    // the draft's unrendered `symbols` bucket and reach the alphabet result
    // unseen (FR-025). Symbols stay shielded by carve's always-keep rule and
    // are out of this feature's scope (FR-012, family default 5).
    seedProposals(
      alreadyConfirmed ? [] : proposal.baseGroup.filter(isPunctuationChar),
      proposal.baseCoverageIncomplete ? "ascii-floor" : "base",
      seedKey,
    );
  }, [loading, baseCoverage, baseKeyboard, inventory, alreadyConfirmed, seedProposals]);

  // FR-011: how many of the chosen marks the base cannot type yet — the
  // missing side of the inventory delta, visible before Done. This is
  // computeInventoryDelta's first production caller.
  const missingCount = useMemo(() => {
    if (ir === null || punctuation.length === 0) return null;
    const needed: InventoryChar[] = punctuation.map((char) => ({ char, inBaseOutput: false }));
    return computeInventoryDelta(needed, ir).missing.length;
  }, [ir, punctuation]);

  // What the exemplar source knows and the draft does not already hold. Like
  // the alphabet screen's SuggestionPanel, a ticked chip LEAVES this list and
  // reappears below in the chosen list, where removal lives — the panel is
  // add-only in practice. After seeding it is normally empty; a REMOVED
  // proposal reappears here so the author can take it back.
  const offered = useMemo(() => tier.filter((c) => !chars.includes(c)), [tier, chars]);

  // The chosen list, grouped by what proposed it. Grouping is derived from
  // the single-valued provenance; an authored character is one the author
  // typed or picked (or re-ticked after removing — see `tick`).
  const cldrChosen = punctuation.filter((c) => isExemplarProvenance(provenance[c]));
  const baseChosen = punctuation.filter((c) => isBaseProvenance(provenance[c]));
  const otherChosen = punctuation.filter(
    (c) => !isExemplarProvenance(provenance[c]) && !isBaseProvenance(provenance[c]),
  );
  const producedByBase = (c: string): boolean => baseCoverage?.produced.includes(c) === true;
  const baseName = baseKeyboard?.displayName ?? baseKeyboard?.id ?? null;
  const cldrSourceLabel = (
    inventory?.source ?? (cldrChosen[0] !== undefined ? provenance[cldrChosen[0]] : undefined) ?? "cldr"
  ).toUpperCase();

  function tick(c: string): void {
    // A removed proposal is on the rejection ledger, which vetoes every
    // proposal add. Ticking it back is as deliberate as typing it, so it
    // becomes the author's own (FR-022: "typing it by hand overrides").
    if (rejected.includes(c) || inventory === null) addChar(c);
    else addProposed(c, inventory.source);
  }

  function add(): void {
    const { chars: harvested } = harvestChars(inputVal);
    if (harvested.length === 0) return;
    // This page collects one category. Anything else typed here is declined
    // visibly (the note below) rather than silently vanishing into the shared
    // draft — a letter added here would resurface in the Phase B alphabet.
    //
    // A single format character (ZWJ, ZWNJ, …) is not punctuation but is not a
    // mistake either: it is handed to the invisibles step — pre-selected
    // there — with a note saying so, and no navigation (FR-016). A longer
    // cluster that contains one is neither split nor filed: it is declined
    // with the reason (FR-021).
    const punct: string[] = [];
    const formatChars: string[] = [];
    const clusters: string[] = [];
    const other: string[] = [];
    //
    // Order matters: `glyphCategory` tests `\p{P}` over the WHOLE cluster
    // without anchors, so "!" + ZWNJ reads as punctuation — checking the
    // format-character cases first is what keeps a format character from
    // being smuggled into the punctuation answer unlabelled.
    for (const c of harvested) {
      if (isFormatChar(c)) formatChars.push(c);
      else if (containsFormatChar(c)) clusters.push(c);
      else if (isPunctuationChar(c)) punct.push(c);
      else other.push(c);
    }
    for (const c of punct) addChar(c);
    for (const c of formatChars) acceptInvisible(toUPlusNotation(c));
    setSkipped(other);
    setHandedOff(formatChars);
    setDeclinedClusters(clusters);
    setInputVal("");
    inputRef.current?.focus();
  }

  function complete(): void {
    if (completedRef.current) return;
    completedRef.current = true;
    const result = punctuationResult();
    saveAnswer(PUNCTUATION_STEP_ID, PUNCTUATION_INVENTORY_ANSWER_ID, {
      value: result.confirmedInventory ?? [],
      answerType: "char-list",
      origin: "confirmed",
      stage: "confirmed",
      evidenceKey,
      screenId: PUNCTUATION_STEP_ID,
    });
    onComplete(result);
  }

  // NOT `inputVal.trim() === ""`: String#trim strips U+FEFF (and every other
  // Unicode White_Space), so a box holding only a ZERO WIDTH NO-BREAK SPACE
  // read as empty and the Add button stayed disabled — the one silent write
  // the SC-009 harness found. Only the four literal ASCII separators count as
  // nothing typed; a format character is content, and is handed off above.
  const addDisabled = !Array.from(inputVal).some((c) => !ASCII_WHITESPACE.has(c));

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
        ) : inventory === null ? (
          <div style={mutedNote}>
            <Trans id="survey.punctuation.cldrAbsent.noExemplars">
              No suggested punctuation: no exemplar data covers {displayName}.
              Add your own below.
            </Trans>
          </div>
        ) : tier.length === 0 ? (
          <div style={mutedNote}>
            <Trans id="survey.punctuation.cldrAbsent.emptyTier">
              No suggested punctuation: {cldrSourceLabel} attests no punctuation
              for {displayName}. Add your own below.
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
              style={chipRow}
            >
              {offered.map((c) => (
                <SuggestedPunctuationChip key={c} char={c} onAdd={tick} />
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
        {handedOff.length > 0 && (
          <p
            role="status"
            data-testid="punctuation-handoff-note"
            style={{ ...mutedParaFlush, margin: "8px 0 0 0" }}
          >
            <Trans id="survey.punctuation.handoffNote">
              {handedOff.map((c) => toUPlusNotation(c)).join(" ")} is an invisible
              character, so it belongs to the next step, Invisible characters — it is
              already selected for you there.
            </Trans>
          </p>
        )}
        {declinedClusters.length > 0 && (
          <p
            role="status"
            data-testid="punctuation-declined-cluster"
            style={{ ...mutedParaFlush, margin: "8px 0 0 0" }}
          >
            <Trans id="survey.punctuation.declinedCluster">
              Skipped {declinedClusters.map((c) => codepointLabel(c).title).join(", ")} —
              it mixes an invisible character with other characters, so it was neither
              split up nor added. Type the visible part here and choose invisible
              characters on the next step.
            </Trans>
          </p>
        )}
      </section>

      {/* Section 3: the accumulated list, grouped by what proposed it */}
      <section
        aria-label={t({
          id: "survey.punctuation.listSectionAriaLabel",
          message: "Your punctuation",
        })}
      >
        <p style={{ margin: "0 0 8px 0", fontSize: 13, fontWeight: 600, color: TEXT_MAIN }}>
          <Trans id="survey.punctuation.listCount">Your punctuation ({punctuation.length})</Trans>
        </p>
        {missingCount !== null && (
          <p data-testid="punctuation-missing-count" style={groupCaption}>
            {t({
              id: "survey.punctuation.missingCount",
              message: plural(missingCount, {
                0: "Every chosen mark is already on the base keyboard.",
                one: "# of these is not on the base keyboard yet and will need a key.",
                other: "# of these are not on the base keyboard yet and will need a key.",
              }),
            })}
          </p>
        )}
        {punctuation.length === 0 ? (
          <p style={mutedParaFlush}>
            <Trans id="survey.punctuation.emptyList">
              No punctuation yet — tick a suggestion, type above, or browse the
              character map on the right.
            </Trans>
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {cldrChosen.length > 0 && (
              <div
                data-testid="cldr-punctuation-group"
                role="group"
                aria-label={t({
                  id: "survey.punctuation.cldrGroup.ariaLabel",
                  message: "Proposed punctuation from the exemplar source — click to remove",
                })}
              >
                <p style={groupCaption}>
                  <Trans id="survey.punctuation.cldrGroup.caption">
                    Proposed from {cldrSourceLabel} exemplars for {displayName} —
                    already chosen for you; click a mark to remove it.
                  </Trans>
                </p>
                <div style={chipRow}>
                  {cldrChosen.map((c) => (
                    <ChosenChip
                      key={c}
                      char={c}
                      isProposed
                      alsoBase={producedByBase(c)}
                      onRemove={removeChar}
                    />
                  ))}
                </div>
              </div>
            )}
            {baseChosen.length > 0 && (
              <div
                data-testid="base-punctuation-group"
                role="group"
                aria-label={t({
                  id: "survey.punctuation.baseGroup.ariaLabel",
                  message: "Proposed punctuation from the base keyboard — click to remove",
                })}
              >
                <p style={groupCaption}>
                  {baseCoverageIncomplete ? (
                    <Trans id="survey.punctuation.baseGroup.incompleteCaption">
                      The full set of punctuation your base keyboard types is not fully
                      known (part of the base is opaque to the studio), so only basic
                      ASCII punctuation is proposed here — click a mark to remove it.
                    </Trans>
                  ) : baseName !== null ? (
                    <Trans id="survey.punctuation.baseGroup.caption">
                      Already typed by your base keyboard ({baseName}) — proposed for
                      you to keep; click a mark to remove it.
                    </Trans>
                  ) : (
                    <Trans id="survey.punctuation.baseGroup.captionNoName">
                      Already typed by your base keyboard — proposed for you to keep;
                      click a mark to remove it.
                    </Trans>
                  )}{" "}
                  <Trans id="survey.punctuation.baseGroup.carveNote">
                    Removing a mark here declares it unsupported, but the base layout
                    still types it until the discard step's punctuation rule changes.
                  </Trans>
                </p>
                <div style={chipRow}>
                  {baseChosen.map((c) => (
                    <ChosenChip key={c} char={c} isProposed onRemove={removeChar} />
                  ))}
                </div>
              </div>
            )}
            {otherChosen.length > 0 && (
              <div
                role="group"
                aria-label={t({
                  id: "survey.punctuation.listGroupAriaLabel",
                  message: "Chosen punctuation — click to remove",
                })}
              >
                {(cldrChosen.length > 0 || baseChosen.length > 0) && (
                  <p style={groupCaption}>
                    <Trans id="survey.punctuation.authoredGroup.caption">
                      Added by you — click a mark to remove it.
                    </Trans>
                  </p>
                )}
                <div style={chipRow}>
                  {otherChosen.map((c) => (
                    <ChosenChip
                      key={c}
                      char={c}
                      isProposed={provenance[c] !== undefined && provenance[c] !== "author"}
                      onRemove={removeChar}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* spec 079 US3 T080: the confirmed inventory was made against
          different evidence — a cue plus the shared jump list. */}
      {flaggedAnswers.length > 0 && (
        <div role="status" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {flaggedAnswers.map((f) => (
            <p key={f.answerId} style={{ margin: 0, fontSize: 13, color: ERROR_RED }}>
              {reproposalCueMessage(f.reason, i18n)}
            </p>
          ))}
          <FlaggedAnswersList stepId="punctuation" items={flaggedWorkItems} />
        </div>
      )}

      {/* Footer: Done — otherwise always enabled; zero punctuation is a valid answer. */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          data-testid="punctuation-done"
          disabled={nextGate.blocked}
          onClick={complete}
          className="ks-focus-ring ks-hit-target"
          style={primaryButton(nextGate.blocked)}
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

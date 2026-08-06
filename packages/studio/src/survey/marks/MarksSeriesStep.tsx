// MarksSeriesStep — the S0-S5 marks question series host (spec 046).
//
// One spine EditorStep between "characters" and "carve" — the series runs
// immediately after alphabet confirmation so how the author thinks of the
// combined letters is known before any key work (carve, mechanisms) begins.
// S0 is a COMPUTED gate that never renders (FR-005): when the confirmed
// alphabet's marks store is empty, the step completes immediately with an
// EMPTY placement worklist and the designer proceeds with no marks screen
// ever shown. When marks exist, stations S1-S5 are sequenced internally
// (skip logic stays local to this host, spec 046 R1); every station's content
// is derived from the alphabet already confirmed at this point (FR-024). Each
// station that has nothing to decide is skipped, so the simple fully-attested
// orthography confirms in at most two rendered screens (SC-002/SC-006).
//
// FR-023 (staleness): every derived input is keyed on the alphabet's CONTENT
// (not object identity). An alphabet edit that changes the evidence re-seeds
// the affected answers from fresh proposals and returns the designer to the
// first station — the affected decisions must be reconfirmed before the
// series can complete again.
//
// Editors are pure (Article IV / G2): this component reports completion via
// onComplete with a SurveyPhaseResult carrying `marksWorklist`; the manifest
// reducer path (StepHost.handleComplete → recordPhase) owns the session merge.

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import type {
  AttestedStack,
  ConfirmedAlphabet,
  SurveyPhaseResult,
} from "@keyboard-studio/contracts";
import {
  confirmedAlphabetKey,
  makeConfirmedAlphabet,
  makeEmptyPlacementWorklist,
  measureKeyBudget,
  stackKey,
} from "@keyboard-studio/contracts";
import {
  groupMarkClasses,
  proposeAttachments,
  nfcPostureOfInventory,
  resolveOutputFormProposal,
  hasDecidablePairs,
  computeMarkTreatmentPrefills,
  buildPlacementWorklist,
  expandCaseCounterpartAttachments,
  expandCaseCounterpartPromotions,
  deriveMarksComputedAxes,
  promotableCharacters,
  prunePromotions,
  pruneMarkOverrides,
  treatmentFor,
  type AttachmentProposal,
  type MarkClass,
  type MarksComputedAxes,
  type MarkTreatment,
  type MarkTreatmentAnswer,
  type OutputForm,
  type PromotedComposedCharacter,
} from "@keyboard-studio/engine";
import type { MarkInputOrder } from "@keyboard-studio/contracts";
import type { EditorStepProps } from "../../steps/types.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import { peekStepCursor, useStepWalkStore } from "../../stores/stepWalkStore.ts";
import { MARKS_STEP_ID } from "../../steps/reducer.ts";
import type { StepWalkPositions } from "../../lib/stepWalk.ts";
import { lowercaseBaseView, casedBaseCount } from "../charNormUtils.ts";
import { AttachmentStation } from "./AttachmentStation.tsx";
import { MarkTreatmentStation } from "./MarkTreatmentStation.tsx";
import { OutputFormStation } from "./OutputFormStation.tsx";
import { StackingStation } from "./StackingStation.tsx";
import {
  ACCENT,
  TEXT_MAIN,
  FONT,
  phaseHeadingFlush,
  mutedParaFlush,
  secondaryButton,
  primaryButton,
} from "../surveyStyles.ts";

// ---------------------------------------------------------------------------
// S0 — the computed gate (never rendered).
// ---------------------------------------------------------------------------

export interface MarksGateResult {
  /** True iff the marks store is empty — the whole series is skipped (FR-005). */
  skip: boolean;
  /** The alphabet the series runs against (empty stores when none confirmed). */
  alphabet: ConfirmedAlphabet;
}

/**
 * Compute the S0 gate from the session's merged alphabet. Recomputed whenever
 * the confirmed alphabet changes (US1 AC2: adding a marked character after a
 * skip makes the series reachable again on the next advance).
 */
export function computeMarksGate(alphabet: ConfirmedAlphabet | undefined): MarksGateResult {
  const resolved = alphabet ?? makeConfirmedAlphabet();
  return { skip: resolved.marks.length === 0, alphabet: resolved };
}

// ---------------------------------------------------------------------------
// Station sequencing — the pinned station ids, in series order.
// ---------------------------------------------------------------------------

/**
 * The rendered stations, in series order. FOUR, down from five (spec 052
 * FR-018/SC-003): the mark input-order question is folded into
 * `marks_treatment` rather than occupying a station of its own.
 */
export type MarksStationId =
  | "marks_attachment"
  | "marks_treatment"
  | "marks_output_form"
  | "marks_stacking";

/** Attachment answers: per mark, per base — checked = reachable on the keyboard. */
export type AttachmentChecked = Record<string, Record<string, boolean>>;

/** Initial S1 state from the proposals: attested pre-checked, everything else unchecked. */
export function initialAttachmentChecked(proposals: AttachmentProposal[]): AttachmentChecked {
  const out: AttachmentChecked = {};
  for (const proposal of proposals) {
    const row: Record<string, boolean> = {};
    for (const [base, state] of Object.entries(proposal.states)) {
      row[base] = state === "attested";
    }
    out[proposal.mark] = row;
  }
  return out;
}

/**
 * A class needs an on-screen S2 confirmation only when there is a genuine
 * decision: more than one mark in the class, or any of its marks reaching
 * more than one base (attested or plausible). A trivially single-pair class
 * takes EVERY one of its answers from the proposal — treatment, promotion, and
 * order — without a screen (spec 052 FR-019; SC-002: the simple orthography
 * stays at two screens).
 */
export function classNeedsTreatmentScreen(
  markClass: MarkClass,
  proposals: AttachmentProposal[],
): boolean {
  if (markClass.marks.length > 1) return true;
  return markClass.marks.some((mark) => {
    const proposal = proposals.find((p) => p.mark === mark);
    if (proposal === undefined) return false;
    return Object.values(proposal.states).filter((s) => s !== "blocked").length > 1;
  });
}

/**
 * The series' phase result: reported on completion (or on the S0 skip). The
 * chosen output form is now a real contract field (SurveyPhaseResult.marksOutputForm,
 * spec 046) — the reducer (steps/reducer.ts MarksCompleteResult) still reads
 * it off this result to decide whether to generate stepwise backspace-unwrap
 * stores; carve's needed-set derivation reads it off the merged session.
 */
function seriesResult(
  worklist = makeEmptyPlacementWorklist(),
  outputForm?: OutputForm,
  computedAxes?: MarksComputedAxes,
): SurveyPhaseResult {
  return {
    phase: "C",
    answers: [],
    marksWorklist: worklist,
    ...(outputForm !== undefined ? { marksOutputForm: outputForm } : {}),
    // spec 052 US4: the recorded treatment finally reaches strategy selection.
    // `computedAxes` is an existing additive optional field merged into
    // session.axes by mergePhaseResults — its OMISSION here was the defect, so
    // this needs no contract change, only a producer.
    ...(computedAxes !== undefined
      ? {
          computedAxes: {
            diacriticBehavior: computedAxes.diacriticBehavior,
            markInputOrder: computedAxes.markInputOrder,
          },
        }
      : {}),
  };
}

const MarksSeriesStep: ComponentType<EditorStepProps> = ({ onComplete, onBack }: EditorStepProps) => {
  const { t } = useLingui();
  const alphabet = useWorkingCopyStore((s) => s.session.alphabet);
  const importedOrder = useWorkingCopyStore((s) => s.session.axes.markInputOrder);
  const baseIr = useWorkingCopyStore((s) => s.baseIr);
  const surveyContext = useSurveySessionStore((s) => s.surveyContext);

  // Content key: derived inputs re-compute only when the alphabet's CONTENT
  // changes, not when the session object is recreated by an unrelated merge.
  const alphabetKey = useMemo(() => confirmedAlphabetKey(alphabet), [alphabet]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const gate = useMemo(() => computeMarksGate(alphabet), [alphabetKey]);

  // Derived station inputs — all pure engine functions over the gate alphabet.
  const classes: MarkClass[] = useMemo(() => groupMarkClasses(gate.alphabet), [gate.alphabet]);
  const proposals = useMemo(
    () => proposeAttachments(gate.alphabet, classes),
    [gate.alphabet, classes],
  );
  const bcp47 = surveyContext.bcp47_tag;
  // Marks questions offer only lowercase/caseless bases (spec 049, US1); the
  // uppercase counterpart's attachment is derived, not asked. The affordance
  // count is pinned to the folded lowercase view (SC-004), and the shared fold
  // is the same one the character step uses (FR-006).
  const attachmentBases = useMemo(
    () => lowercaseBaseView(gate.alphabet.bases, bcp47),
    [gate.alphabet, bcp47],
  );
  const casePairCount = useMemo(
    () => casedBaseCount(gate.alphabet.bases, bcp47),
    [gate.alphabet, bcp47],
  );
  const posture = useMemo(() => nfcPostureOfInventory(gate.alphabet), [gate.alphabet]);

  // --- answers (each re-seeded when its evidence changes — FR-023/FR-020) ---

  const [attachmentChecked, setAttachmentChecked] = useState<AttachmentChecked>(() =>
    initialAttachmentChecked(proposals),
  );
  useEffect(() => {
    setAttachmentChecked(initialAttachmentChecked(proposals));
  }, [proposals]);

  // The case-expanded attachment map is what "reachable" means downstream: US1
  // asked only about lowercase bases, so every checked cased base additively
  // checks its uppercase counterpart (spec 049 US2 / FR-002).
  const expandedAttachments = useMemo(
    () => expandCaseCounterpartAttachments(gate.alphabet, attachmentChecked, bcp47),
    [gate.alphabet, attachmentChecked, bcp47],
  );

  // The single authoritative key-budget determination (spec 052 FR-016). Null
  // when there is no base, or when the base binds no stock physical key at all —
  // an unmeasured budget, which does not gate promotion (see the prefill's
  // options JSDoc). Every other report of key availability in the product is a
  // projection of this same measurement (SC-008).
  const keyBudget = useMemo(
    () => (baseIr != null ? measureKeyBudget(baseIr) : null),
    [baseIr],
  );

  const treatmentPrefills = useMemo(
    () =>
      computeMarkTreatmentPrefills(gate.alphabet, classes, proposals, {
        baseIr,
        keyBudget,
        attachments: expandedAttachments,
        ...(bcp47 !== undefined ? { bcp47 } : {}),
      }),
    [gate.alphabet, classes, proposals, baseIr, keyBudget, expandedAttachments, bcp47],
  );

  // What each class could promote — offered on lowercase/caseless bases only.
  // An empty list means promotion is ABSENT for that class (nothing to decide),
  // which the station renders as no group at all.
  const promotable = useMemo(() => {
    const out: Record<string, PromotedComposedCharacter[]> = {};
    for (const markClass of classes) {
      out[markClass.id] = promotableCharacters(
        gate.alphabet,
        markClass,
        expandedAttachments,
        bcp47,
      );
    }
    return out;
  }, [gate.alphabet, classes, expandedAttachments, bcp47]);

  // S2 — the three-part answer (spec 052). Input order is prefilled from the
  // base keyboard's own behavior when available (detectMarkInputOrderFromImport
  // seeds session.axes.markInputOrder).
  const prefilledFromImport = importedOrder === "prefix" || importedOrder === "postfix";
  const seededOrder: MarkInputOrder = prefilledFromImport
    ? (importedOrder as MarkInputOrder)
    : "postfix";
  const [orderExplicitlySet, setOrderExplicitlySet] = useState(false);
  const [treatment, setTreatment] = useState<MarkTreatmentAnswer>(() => ({
    classTreatment: {},
    markTreatment: {},
    promoted: [],
    inputOrder: seededOrder,
  }));

  // FR-020: an alphabet edit re-proposes ALL THREE answers — treatment re-seeded
  // from the fresh prefills, per-mark overrides pruned to surviving marks, and
  // promotions pruned to still-reachable pairs. The order answer is re-seeded
  // from the base prefill ONLY when the author had not set it explicitly.
  useEffect(() => {
    setTreatment((prev) => {
      const classTreatment: Record<string, MarkTreatment> = {};
      for (const prefill of treatmentPrefills) {
        classTreatment[prefill.classId] = prefill.recommended;
      }
      return {
        classTreatment,
        markTreatment: pruneMarkOverrides(prev.markTreatment, gate.alphabet.marks),
        promoted: prunePromotions(gate.alphabet, prev.promoted, expandedAttachments),
        inputOrder: orderExplicitlySet ? prev.inputOrder : seededOrder,
      };
    });
    // `orderExplicitlySet` and `seededOrder` are read, not tracked: re-seeding is
    // driven by the evidence changing, not by the author toggling the order.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treatmentPrefills, gate.alphabet, expandedAttachments]);

  const hasOwnKeyMark = useMemo(
    () =>
      gate.alphabet.marks.some(
        (mark) => treatmentFor(mark, treatment, classes, treatmentPrefills) === "own-key",
      ),
    [gate.alphabet.marks, treatment, classes, treatmentPrefills],
  );

  const outputFormProposal = useMemo(
    () => resolveOutputFormProposal(posture, hasOwnKeyMark),
    [posture, hasOwnKeyMark],
  );
  const [outputForm, setOutputForm] = useState<OutputForm>(outputFormProposal.form);
  useEffect(() => {
    setOutputForm(outputFormProposal.form);
  }, [outputFormProposal.form]);

  // S5 — evidence: an attested >=2-mark stack, or two marks' reachable base
  // sets overlapping (FR-018). Confirmed list defaults to the attested stacks
  // (propose-then-confirm), never inferred from attachment rows (FR-019).
  const multiMarkStacks = useMemo<AttestedStack[]>(
    () => gate.alphabet.attestedStacks.filter((s) => s.marks.length >= 2),
    [gate.alphabet],
  );
  const marksOverlap = useMemo(() => {
    const reachable = proposals.map((p) =>
      new Set(Object.entries(p.states).filter(([, s]) => s !== "blocked").map(([b]) => b)),
    );
    for (let i = 0; i < reachable.length; i++) {
      for (let j = i + 1; j < reachable.length; j++) {
        const a = reachable[i];
        const b = reachable[j];
        if (a !== undefined && b !== undefined && [...a].some((x) => b.has(x))) return true;
      }
    }
    return false;
  }, [proposals]);
  const stackingEvidence = multiMarkStacks.length > 0 || marksOverlap;
  const [stackingAllowed, setStackingAllowed] = useState<boolean>(multiMarkStacks.length > 0);
  const [stacksConfirmed, setStacksConfirmed] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setStackingAllowed(multiMarkStacks.length > 0);
    const seeded: Record<string, boolean> = {};
    for (const stack of multiMarkStacks) seeded[stackKey(stack)] = true;
    setStacksConfirmed(seeded);
  }, [multiMarkStacks]);

  // --- visible stations, in series order (at most FOUR — FR-018/SC-003) ---
  const needsTreatmentScreen = classes.some((c) => classNeedsTreatmentScreen(c, proposals));
  const visibleStations: MarksStationId[] = useMemo(() => {
    const stations: MarksStationId[] = [];
    if (proposals.length > 0) stations.push("marks_attachment");
    if (needsTreatmentScreen) stations.push("marks_treatment");
    if (hasDecidablePairs(posture)) stations.push("marks_output_form");
    if (stackingEvidence) stations.push("marks_stacking");
    return stations;
  }, [proposals, needsTreatmentScreen, posture, stackingEvidence]);

  // ARRIVAL POSITION, resolved before the first render (spec 061 FR-004: the
  // series "MUST restore to the station named by an activated mark on
  // arrival"). Read in the state initializer rather than in an effect, for the
  // reason SurveyRunner reads its own arrival cursor there: a jump writes the
  // cursor BEFORE this component mounts, and the walk-publishing effect below
  // writes the cursor for whatever station is current — so an effect-based
  // arrival read would race a first-render `0` back into the store and lose the
  // jump the author just made.
  const [stationIndex, setStationIndex] = useState(() => {
    const cursor = peekStepCursor(MARKS_STEP_ID);
    const index = cursor === undefined ? -1 : visibleStations.indexOf(cursor as MarksStationId);
    return index === -1 ? 0 : index;
  });

  // FR-023: evidence changed → back to the first station; the affected
  // (re-seeded) decisions must be walked again before completing.
  //
  // ADJUSTED DURING RENDER, not in an effect. As an effect this left a COMMIT in
  // which `alphabetKey` had already changed but `stationIndex` had not yet reset
  // — and the walk-publishing effect below runs in that same commit, so it wrote
  // a cursor derived from the stale index. With the station list itself
  // reshaped by the same evidence change, that stale cursor could name a
  // different station than the author was on and be read straight back in by the
  // arrival effect, defeating the reset FR-023 says keeps precedence. Adjusting
  // during render (React's documented "adjust state when props change" pattern)
  // removes the stale commit entirely rather than adding a second guard against
  // its symptoms.
  const resetAlphabetKeyRef = useRef(alphabetKey);
  if (resetAlphabetKeyRef.current !== alphabetKey) {
    resetAlphabetKeyRef.current = alphabetKey;
    setStationIndex(0);
  }

  const currentStation = visibleStations[Math.min(stationIndex, visibleStations.length - 1)];

  // ---------------------------------------------------------------------------
  // Publish the within-step walk (spec 061 FR-004; closes D-4).
  //
  // Until this existed the series' up-to-four stations shared ONE footer mark
  // even while the author was standing in them, and no station was individually
  // addressable. Publishing the walk fixes both at once, and the second half
  // costs nothing extra: the four station ids are already `[a-z0-9_]+`, so they
  // are legal `Location` question segments, and `liveResolveContext()` passes
  // `stepPositions` from this very store — the same mechanism that makes a
  // gallery's character tokens resolvable. No resolver change, no
  // `questionRegistry` entry (these are stations, not survey questions).
  //
  // One position per VISIBLE station (Q2/SC-003), never four placeholders: a
  // station the evidence never raises is a page the author will never see, and
  // 057 FR-049a forbids a greyed-out mark for it. The row therefore lengthens as
  // evidence resolves, which 057 FR-049c already calls expected.
  //
  // `required: true` per station (A2) — the series gates its own advance, so a
  // station the author has not walked is genuinely outstanding.
  //
  // `done` is "at or before the cursor". Every station arrives with a proposed
  // default already filled in (propose-then-confirm, spec v1.3.1 §3c), so
  // STANDING on one is what settles it — which also means the last station reads
  // done at the moment `complete()` fires, leaving the whole series complete in
  // the row once the author moves on.
  // ---------------------------------------------------------------------------
  const publishStepWalk = useStepWalkStore((s) => s.publishStepWalk);
  const setStepCursor = useStepWalkStore((s) => s.setStepCursor);
  const stationCursor = useStepWalkStore((s) => s.cursors[MARKS_STEP_ID]);

  const stationPositions: StepWalkPositions = useMemo(
    () =>
      visibleStations.map((id, i) => ({
        id,
        done: i <= stationIndex,
        required: true,
      })),
    [visibleStations, stationIndex],
  );

  useEffect(() => {
    publishStepWalk(MARKS_STEP_ID, stationPositions);
    if (currentStation !== undefined) setStepCursor(MARKS_STEP_ID, currentStation);
  }, [stationPositions, currentStation, publishStepWalk, setStepCursor]);

  // Honour a cursor written while this component is ALREADY MOUNTED — a footer
  // mark activated for another station in the step the author is currently on.
  // That jump changes no route and no step, so nothing remounts and the state
  // initializer above never re-runs. (Mirrors SurveyRunner's own pair of an
  // initializer read plus a live-cursor effect.)
  //
  // The evidence-changed reset keeps precedence (052 FR-023, and FR-004 says so
  // explicitly) by construction rather than by a guard here: the reset is
  // applied during render, so by the time this effect sees a cursor the
  // publishing effect above has already rewritten it to the first station.
  useEffect(() => {
    if (stationCursor === undefined) return;
    const index = visibleStations.indexOf(stationCursor as MarksStationId);
    if (index === -1) return;
    setStationIndex(index);
  }, [stationCursor, visibleStations]);

  // S0 skip: never render — stay TRANSPARENT in the direction of travel. On a
  // forward entry, complete immediately (empty worklist → mechanism gallery).
  // On a back-pop entry (the designer pressed Back on the mechanism gallery),
  // keep popping backward to carve instead of bouncing them forward again.
  const completedRef = useRef(false);
  useEffect(() => {
    if (gate.skip && !completedRef.current) {
      completedRef.current = true;
      if (useSurveySessionStore.getState().lastNavigation === "pop" && onBack !== undefined) {
        onBack();
      } else {
        onComplete(seriesResult());
      }
    }
  }, [gate.skip, onComplete, onBack]);

  if (gate.skip) return null;

  function complete(): void {
    if (completedRef.current) return;
    completedRef.current = true;
    // Assemble the FR-020 handoff. The stacking answer constrains the stack
    // list downstream; the worklist's three groups cover every base and mark at
    // least once with nothing unclassified (spec 052 SC-009, verified in engine
    // tests). The attachment map is already case-expanded (spec 049 US2), and
    // the promotion set gets the same additive treatment: promoting a lowercase
    // marked character derives its uppercase counterpart rather than asking
    // about it separately (spec 052 FR-023).
    const worklist = buildPlacementWorklist({
      alphabet: gate.alphabet,
      classes,
      attachments: expandedAttachments,
      prefills: treatmentPrefills,
      treatment: {
        ...treatment,
        promoted: expandCaseCounterpartPromotions(gate.alphabet, treatment.promoted, bcp47),
      },
    });
    // US4: project the recorded treatment onto A4/A3a so strategy selection can
    // see the answer. Without this the survey builds a keyboard on two premises
    // at once — the author's recorded treatment and an independently-derived
    // diacritic-behaviour axis — with nothing detecting the contradiction.
    const computedAxes = deriveMarksComputedAxes({
      alphabet: gate.alphabet,
      classes,
      prefills: treatmentPrefills,
      treatment,
    });
    onComplete(seriesResult(worklist, outputForm, computedAxes));
  }

  function handleContinue(): void {
    if (stationIndex + 1 < visibleStations.length) {
      setStationIndex(stationIndex + 1);
    } else {
      complete();
    }
  }

  function handleStationBack(): void {
    if (stationIndex > 0) {
      setStationIndex(stationIndex - 1);
    } else {
      onBack?.();
    }
  }

  return (
    <div
      data-testid="marks-series"
      style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 640, fontFamily: FONT, color: TEXT_MAIN, padding: 16, overflow: "auto" }}
    >
      {(stationIndex > 0 || onBack !== undefined) && (
        <button type="button" onClick={handleStationBack} style={{ alignSelf: "flex-start", ...secondaryButton }}>
          <Trans id="survey.marks.series.backButton">Back</Trans>
        </button>
      )}
      <h2 style={{ ...phaseHeadingFlush, color: ACCENT }}>
        <Trans id="survey.marks.series.heading">Accents &amp; marks</Trans>
      </h2>
      <p style={mutedParaFlush}>
        {t({
          id: "survey.marks.series.intro",
          message: plural(gate.alphabet.marks.length, {
            one: "Your alphabet includes # mark. Confirm how they attach to your letters before placing keys.",
            other: "Your alphabet includes # marks. Confirm how they attach to your letters before placing keys.",
          }),
        })}
      </p>

      {currentStation === "marks_attachment" && (
        <AttachmentStation
          proposals={proposals}
          bases={attachmentBases}
          checked={attachmentChecked}
          onToggle={(mark, base, next) =>
            setAttachmentChecked((prev) => ({
              ...prev,
              [mark]: { ...prev[mark], [base]: next },
            }))
          }
          casePairCount={casePairCount}
        />
      )}

      {currentStation === "marks_treatment" && (
        <MarkTreatmentStation
          classes={classes}
          prefills={treatmentPrefills}
          answer={treatment}
          promotable={promotable}
          demoLetters={attachmentBases}
          onClassTreatmentChange={(classId, next) =>
            setTreatment((prev) => ({
              ...prev,
              classTreatment: { ...prev.classTreatment, [classId]: next },
            }))
          }
          onMarkTreatmentChange={(mark, next) =>
            setTreatment((prev) => ({
              ...prev,
              markTreatment: { ...prev.markTreatment, [mark]: next },
            }))
          }
          onPromotionToggle={(character, next) =>
            setTreatment((prev) => {
              const nfc = character.normalize("NFC");
              const without = prev.promoted.filter((c) => c.normalize("NFC") !== nfc);
              return { ...prev, promoted: next ? [...without, nfc] : without };
            })
          }
          onInputOrderChange={(next) => {
            setOrderExplicitlySet(true);
            setTreatment((prev) => ({ ...prev, inputOrder: next }));
          }}
          orderPrefilledFromImport={prefilledFromImport && !orderExplicitlySet}
        />
      )}

      {currentStation === "marks_output_form" && (
        <OutputFormStation
          posture={posture}
          proposal={outputFormProposal}
          value={outputForm}
          onChange={setOutputForm}
        />
      )}

      {currentStation === "marks_stacking" && (
        <StackingStation
          multiMarkStacks={multiMarkStacks}
          allowed={stackingAllowed}
          onAllowedChange={setStackingAllowed}
          confirmed={stacksConfirmed}
          onConfirmChange={(key, next) =>
            setStacksConfirmed((prev) => ({ ...prev, [key]: next }))
          }
        />
      )}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          data-testid="marks-continue"
          onClick={handleContinue}
          style={primaryButton(false)}
        >
          <Trans id="survey.marks.series.continueButton">Continue</Trans>
        </button>
      </div>
    </div>
  );
};

export { MarksSeriesStep };

// MarksSeriesStep — the S0-S5 marks question series host (spec 071).
//
// One spine EditorStep between "characters" and "carve" — the series runs
// immediately after alphabet confirmation so how the author thinks of the
// combined letters is known before any key work (carve, mechanisms) begins.
// S0 is a COMPUTED gate that never renders (FR-005): when the confirmed
// alphabet's marks store is empty, the step completes immediately with an
// EMPTY placement worklist and the designer proceeds with no marks screen
// ever shown. When marks exist, stations S1-S5 are sequenced internally
// (skip logic stays local to this host, spec 071 R1); every station's content
// is derived from the alphabet already confirmed at this point (FR-024). Each
// station that has nothing to decide is skipped, so the simple fully-attested
// orthography confirms in at most two rendered screens (SC-002/SC-006).
//
// spec 079 (survey-answer-persistence): every answer here is read from
// `surveyAnswerStore.steps.marks` through `reconcile()` (steps/evidence.ts)
// against a per-answer evidence key, not from local `useState` re-seeded by an
// effect. A saved answer is NEVER rewritten by a shape change (R-03) — only
// the author's own confirm/overturn calls `saveAnswer`. `position` (the
// current station id) lives in the SAME store (`setPosition`), replacing the
// old local `stationIndex` and its alphabetKey-triggered reset-to-0 effect:
// navigating away and back, or an unrelated alphabet edit, no longer moves the
// author (FR-004/FR-023 generalised — see spec 079's amendment to spec 071).
// Each station's Next records that station's answers through
// `recordQuestionAnswers` (R-04) EXCEPT the final one: the final station's
// answers ride the step's own completion (`seriesResult`'s `answers`), so the
// mark-guards keyboard effect and the decision-record capture land together
// (R-05). `decisionLogStore.append`'s own no-op-on-identical-value behaviour
// means recording the same answers twice (once per-Next, once at completion)
// is harmless — see `createDecisionRecorder.ts`.
//
// Editors are pure (Article IV / G2): this component reports completion via
// onComplete with a SurveyPhaseResult carrying `marksWorklist`; the manifest
// reducer path (StepHost.handleComplete → recordPhase) owns the session merge.

import { useEffect, useMemo, useRef, type ComponentType } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import type {
  AttestedStack,
  ConfirmedAlphabet,
  SurveyAnswer,
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
  treatmentFor,
  getEffectiveFacet,
  CASING_FACET_ID,
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
import { useSurveyAnswerStore, type SavedAnswer } from "../../stores/surveyAnswerStore.ts";
import { useRecordQuestionAnswers } from "../../lib/questionRecorder.ts";
import {
  reconcile,
  marksAttachmentKey,
  marksClassTreatmentKey,
  marksMarkTreatmentKey,
  marksStackKey as marksStackEvidenceKey,
  marksOutputFormKey,
  marksInputOrderKey,
  marksPromotedKey,
  marksStackingAllowedKey,
} from "../../steps/evidence.ts";
import { deriveMarksFlags, reconciledAttachmentChecked, type FlaggedMarksAnswer, type MarksStationId } from "./marksViews.ts";
import { reproposalCueMessage } from "../reproposalReason.ts";
import { FlaggedAnswersList } from "../../components/FlaggedAnswersList.tsx";
import { useFlaggedNextGate } from "../../hooks/useFlaggedNextGate.ts";
import { useStepWalkStore } from "../../stores/stepWalkStore.ts";
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
 *
 * Canonical definition moved to `marksViews.ts` (spec 079 US3), which needs it
 * too and must not fork it; re-exported here so nothing importing it from this
 * module has to change.
 */
export type { MarksStationId } from "./marksViews.ts";

/** Attachment answers: per mark, per base — checked = reachable on the keyboard. */
export type AttachmentChecked = Record<string, Record<string, boolean>>;

/**
 * Initial S1 state from the proposals: attested pre-checked, everything else
 * unchecked. Moved to `marksViews.ts` (spec 079) so `hooks/useWorkToDo.ts` can
 * derive the SAME default attachment view for its badge computation without
 * importing this component module; re-exported here unchanged.
 */
export { initialAttachmentChecked } from "./marksViews.ts";

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
 * spec 071) — the reducer (steps/reducer.ts MarksCompleteResult) still reads
 * it off this result to decide whether to generate stepwise backspace-unwrap
 * stores; carve's needed-set derivation reads it off the merged session.
 *
 * spec 079 R-04: `answers` now carries every station's recorded answers (not
 * just the final one) — `decisionLogStore.append`'s identical-value no-op
 * means the earlier stations' answers, already recorded at their own Next,
 * cost nothing extra to repeat here; this is what stops the stacking answers
 * (F-1) and every other station's answers from being discarded on completion.
 */
function seriesResult(
  worklist = makeEmptyPlacementWorklist(),
  outputForm?: OutputForm,
  computedAxes?: MarksComputedAxes,
  answers: SurveyAnswer[] = [],
): SurveyPhaseResult {
  return {
    phase: "C",
    answers,
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

const STEP_ID = "marks";

/** Stable empty-answers reference, so a not-yet-visited step's derived memos
 * don't recompute on every render (the alternative, `?? {}`, is a fresh
 * object literal each render). */
const EMPTY_ANSWERS: Record<string, SavedAnswer> = {};
/** Stable empty-lastRecorded reference for a not-yet-visited step, same reason
 * as {@link EMPTY_ANSWERS}. */
const EMPTY_LAST_RECORDED: Record<string, string> = {};

const MarksSeriesStep: ComponentType<EditorStepProps> = ({ onComplete, onBack }: EditorStepProps) => {
  const { t, i18n } = useLingui();
  const alphabet = useWorkingCopyStore((s) => s.session.alphabet);
  const importedOrder = useWorkingCopyStore((s) => s.session.axes.markInputOrder);
  const baseIr = useWorkingCopyStore((s) => s.baseIr);
  const surveyContext = useSurveySessionStore((s) => s.surveyContext);

  const saveAnswer = useSurveyAnswerStore((s) => s.saveAnswer);
  const setPosition = useSurveyAnswerStore((s) => s.setPosition);
  const marksStepAnswers = useSurveyAnswerStore((s) => s.steps.marks);
  const savedAnswers = marksStepAnswers?.answers ?? EMPTY_ANSWERS;
  const recordScreen = useRecordQuestionAnswers();

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
  // The GATE for "is this base cased at all" (spec 048 FR-006): reads the
  // working-copy IR's `casing` facet, effective-value accessor, rather than
  // inferring it per-character from `caseCounterpart`'s Unicode general-category
  // test. The two can disagree — Georgian is Unicode-bicameral (Mkhedruli/
  // Mtavruli both carry a case) but the facet's script-identity derivation
  // reads it as caseless (see casePair.ts's Georgian note) — so the facet,
  // not the per-character test, is what decides whether the case-expansion
  // machinery below runs at all. `caseCounterpart` itself is unchanged and
  // still does the actual uppercase/lowercase PAIR derivation once the gate
  // is open (spec 049's follow-up note).
  //
  // "mixed" opens the gate too: the facet's own definition of mixed is
  // "attests both a cased AND a caseless script" (casing.ts's deriveCasingFacet),
  // not "attests two cased scripts" — and either way, everything below this
  // gate is already per-character via caseCounterpart's Unicode category test,
  // which returns null for a caseless-script character regardless of what the
  // keyboard's OTHER attested scripts are. Opening the gate for "mixed" folds
  // exactly the cased subset and leaves caseless characters alone; it doesn't
  // require new filtering, because that's what these primitives already do.
  const casingValue = baseIr != null ? getEffectiveFacet(baseIr, CASING_FACET_ID).value : undefined;
  const isCasedBase = casingValue === "cased" || casingValue === "mixed";
  // Marks questions offer only lowercase/caseless bases (spec 049, US1); the
  // uppercase counterpart's attachment is derived, not asked. The affordance
  // count is pinned to the folded lowercase view (SC-004), and the shared fold
  // is the same one the character step uses (FR-006).
  const attachmentBases = useMemo(
    () => (isCasedBase ? lowercaseBaseView(gate.alphabet.bases, bcp47) : gate.alphabet.bases),
    [gate.alphabet, bcp47, isCasedBase],
  );
  const casePairCount = useMemo(
    () => (isCasedBase ? casedBaseCount(gate.alphabet.bases, bcp47) : 0),
    [gate.alphabet, bcp47, isCasedBase],
  );
  const posture = useMemo(() => nfcPostureOfInventory(gate.alphabet), [gate.alphabet]);

  // --- S1 attachment: derived from the store via reconcile(), never useState ---

  // spec 079 US3 parity fix: this is the SAME `reconciledAttachmentChecked`
  // `hooks/useWorkToDo.ts` calls for the badge computation, so the two can
  // never disagree about which attachments are actually checked.
  const attachmentChecked: AttachmentChecked = useMemo(
    () => reconciledAttachmentChecked(gate.alphabet, proposals, savedAnswers),
    [proposals, savedAnswers, gate.alphabet],
  );

  // The case-expanded attachment map is what "reachable" means downstream: US1
  // asked only about lowercase bases, so every checked cased base additively
  // checks its uppercase counterpart (spec 049 US2 / FR-002).
  const expandedAttachments = useMemo(
    () =>
      isCasedBase
        ? expandCaseCounterpartAttachments(gate.alphabet, attachmentChecked, bcp47)
        : attachmentChecked,
    [gate.alphabet, attachmentChecked, bcp47, isCasedBase],
  );

  function handleAttachmentToggle(mark: string, base: string, next: boolean): void {
    const proposal = proposals.find((p) => p.mark === mark);
    const proposedValue = proposal?.states[base] === "attested";
    const key = marksAttachmentKey(gate.alphabet, mark, base);
    saveAnswer(STEP_ID, `marks_attachment.${mark}|${base}`, {
      value: next,
      answerType: "boolean",
      origin: next === proposedValue ? "confirmed" : "overturned",
      stage: "draft",
      evidenceKey: key,
      screenId: "marks_attachment",
    });
  }

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

  // --- S2 treatment: class/mark treatment, promotion, input order (all from
  // the store via reconcile()) ---

  const classTreatment: Record<string, MarkTreatment> = {};
  for (const prefill of treatmentPrefills) {
    const markClass = classes.find((c) => c.id === prefill.classId);
    const key = marksClassTreatmentKey(markClass?.marks ?? []);
    const view = reconcile(
      savedAnswers[`marks_treatment.class.${prefill.classId}`],
      key,
      prefill.recommended,
    );
    classTreatment[prefill.classId] = view.value as MarkTreatment;
  }

  const markTreatment: Record<string, MarkTreatment> = {};
  for (const mark of gate.alphabet.marks) {
    const markClass = classes.find((c) => c.marks.includes(mark));
    if (markClass === undefined) continue;
    const saved = savedAnswers[`marks_treatment.mark.${mark}`];
    // A per-mark override exists only once the author sets one explicitly — an
    // unsaved override falls through to the class answer via `treatmentFor`,
    // never a proposal of its own.
    if (saved === undefined) continue;
    const key = marksMarkTreatmentKey(gate.alphabet, mark, markClass.id);
    const view = reconcile(saved, key, saved.value as MarkTreatment, (v) => v);
    markTreatment[mark] = view.value as MarkTreatment;
  }

  // spec 079 US3 item 5: keyed over the SAVED promoted list's own components'
  // presence, not the whole alphabet (`marksKey`) — an unrelated letter
  // addition must not flag every promotion (SC-003).
  const savedPromotedAnswer = savedAnswers["marks_treatment.promoted"];
  const savedPromoted = (savedPromotedAnswer?.value as string[] | undefined) ?? [];
  const promotedKey = marksPromotedKey(gate.alphabet, savedPromoted);
  const promotedView = reconcile(
    savedPromotedAnswer,
    promotedKey,
    [] as string[],
    (saved) => prunePromotions(gate.alphabet, saved, expandedAttachments),
  );
  const promoted = promotedView.value;

  function handleClassTreatmentChange(classId: string, next: MarkTreatment): void {
    const markClass = classes.find((c) => c.id === classId);
    const prefill = treatmentPrefills.find((p) => p.classId === classId);
    const key = marksClassTreatmentKey(markClass?.marks ?? []);
    saveAnswer(STEP_ID, `marks_treatment.class.${classId}`, {
      value: next,
      answerType: "select",
      origin: next === prefill?.recommended ? "confirmed" : "overturned",
      stage: "draft",
      evidenceKey: key,
      screenId: "marks_treatment",
    });
  }

  function handleMarkTreatmentChange(mark: string, next: MarkTreatment): void {
    const markClass = classes.find((c) => c.marks.includes(mark));
    const classAnswer = markClass !== undefined ? classTreatment[markClass.id] : undefined;
    const key = marksMarkTreatmentKey(gate.alphabet, mark, markClass?.id ?? "");
    saveAnswer(STEP_ID, `marks_treatment.mark.${mark}`, {
      value: next,
      answerType: "select",
      origin: next === classAnswer ? "confirmed" : "overturned",
      stage: "draft",
      evidenceKey: key,
      screenId: "marks_treatment",
    });
  }

  function handlePromotionToggle(character: PromotedComposedCharacter, next: boolean): void {
    const nfc = character.normalize("NFC");
    const without = promoted.filter((c) => c.normalize("NFC") !== nfc);
    const nextPromoted = next ? [...without, nfc] : without;
    saveAnswer(STEP_ID, "marks_treatment.promoted", {
      value: nextPromoted,
      answerType: "char-list",
      origin: nextPromoted.length === 0 ? "confirmed" : "overturned",
      stage: "draft",
      // Keyed off the value being saved NOW, not the stale `promotedKey`
      // (which reflects the previously-saved list) — see marksPromotedKey's
      // doc for why the key depends on the value itself (spec 079 US3 item 5).
      evidenceKey: marksPromotedKey(gate.alphabet, nextPromoted),
      screenId: "marks_treatment",
    });
  }

  // Own-key resolution needs only class/mark treatment (never `inputOrder`
  // itself), so it can be computed before the input-order answer below.
  const ownKeyMarks = gate.alphabet.marks.filter(
    (mark) =>
      treatmentFor(
        mark,
        { classTreatment, markTreatment, promoted, inputOrder: "postfix" },
        classes,
        treatmentPrefills,
      ) === "own-key",
  );
  const hasOwnKeyMark = ownKeyMarks.length > 0;

  const outputFormProposal = useMemo(
    () => resolveOutputFormProposal(posture, hasOwnKeyMark),
    [posture, hasOwnKeyMark],
  );

  // S2 — input order. Prefilled from the base keyboard's own behavior when
  // available (detectMarkInputOrderFromImport seeds session.axes.markInputOrder).
  const prefilledFromImport = importedOrder === "prefix" || importedOrder === "postfix";
  const seededOrder: MarkInputOrder = prefilledFromImport
    ? (importedOrder as MarkInputOrder)
    : "postfix";
  // spec 079 US3 item 5 / FR-012: an explicitly set order is carried forward
  // via `adjust` while still applicable, and treated as `inactive` (kept, no
  // flag) rather than `reproposed` once no mark has a key of its own to order
  // — `currentKey = null` is `reconcile()`'s inactive signal.
  const orderKey = hasOwnKeyMark ? marksInputOrderKey(ownKeyMarks) : null;
  const savedOrder = savedAnswers["marks_treatment.input_order"];
  const orderExplicitlySet = savedOrder !== undefined;
  const orderView = reconcile(savedOrder, orderKey, seededOrder, (saved) => saved as MarkInputOrder);
  const inputOrder = orderView.value;

  function handleInputOrderChange(next: MarkInputOrder): void {
    saveAnswer(STEP_ID, "marks_treatment.input_order", {
      value: next,
      answerType: "select",
      origin: next === seededOrder ? "confirmed" : "overturned",
      stage: "draft",
      evidenceKey: orderKey,
      screenId: "marks_treatment",
    });
  }

  const treatment: MarkTreatmentAnswer = { classTreatment, markTreatment, promoted, inputOrder };

  // --- S4 output form ---

  const postureId = useMemo(
    () =>
      [...posture]
        .map((p) => `${stackKey(p.stack)}:${p.hasReadyMadeForm ? 1 : 0}`)
        .sort()
        .join(","),
    [posture],
  );
  const outputFormKey = marksOutputFormKey(postureId);
  const outputFormView = reconcile(
    savedAnswers["marks_output_form.form"],
    outputFormKey,
    outputFormProposal.form,
  );
  const outputForm = outputFormView.value as OutputForm;

  function handleOutputFormChange(next: OutputForm): void {
    saveAnswer(STEP_ID, "marks_output_form.form", {
      value: next,
      answerType: "select",
      origin: next === outputFormProposal.form ? "confirmed" : "overturned",
      stage: "draft",
      evidenceKey: outputFormKey,
      screenId: "marks_output_form",
    });
  }

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

  // spec 079 US3 item 5: keyed over the SET of attested multi-mark stacks, not
  // the whole alphabet (`marksKey`) — SC-003.
  const stackingKey = marksStackingAllowedKey(multiMarkStacks.map((s) => stackKey(s)));
  const stackingProposal = multiMarkStacks.length > 0;
  const stackingAllowedView = reconcile(
    savedAnswers["marks_stacking.allowed"],
    stackingKey,
    stackingProposal,
  );
  const stackingAllowed = stackingAllowedView.value as boolean;

  const stacksConfirmed: Record<string, boolean> = {};
  for (const stack of multiMarkStacks) {
    const key = stackKey(stack);
    const evidenceKey = marksStackEvidenceKey(gate.alphabet, stack.marks);
    const view = reconcile(savedAnswers[`marks_stacking.stack.${key}`], evidenceKey, true);
    stacksConfirmed[key] = view.value as boolean;
  }

  function handleStackingAllowedChange(next: boolean): void {
    saveAnswer(STEP_ID, "marks_stacking.allowed", {
      value: next,
      answerType: "boolean",
      origin: next === stackingProposal ? "confirmed" : "overturned",
      stage: "draft",
      evidenceKey: stackingKey,
      screenId: "marks_stacking",
    });
  }

  function handleStackConfirmChange(key: string, next: boolean): void {
    const stack = multiMarkStacks.find((s) => stackKey(s) === key);
    const evidenceKey =
      stack !== undefined ? marksStackEvidenceKey(gate.alphabet, stack.marks) : stackingKey;
    saveAnswer(STEP_ID, `marks_stacking.stack.${key}`, {
      value: next,
      answerType: "boolean",
      origin: next ? "confirmed" : "overturned",
      stage: "draft",
      evidenceKey,
      screenId: "marks_stacking",
    });
  }

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

  // spec 079 FR-004/FR-023: the author's position inside the series lives in
  // the answer store, not local state — leaving and returning (or an
  // unrelated alphabet edit) never moves them back to the first station.
  const savedPosition = marksStepAnswers?.position ?? null;
  const stationIndex =
    savedPosition !== null
      ? Math.max(visibleStations.indexOf(savedPosition as MarksStationId), 0)
      : 0;
  const currentStation = visibleStations[Math.min(stationIndex, visibleStations.length - 1)];

  // The footer reads the store's position as this step's cursor. On first
  // entry it is null, and after an edit that hides the saved station it names
  // a screen that no longer exists — both fall back to a station here, so
  // write that fallback back or the footer rings the wrong station.
  useEffect(() => {
    if (currentStation !== undefined && savedPosition !== currentStation) {
      setPosition(STEP_ID, currentStation);
    }
  }, [currentStation, savedPosition, setPosition]);

  // spec 079 US3: which saved answers are flagged, and why — the ONE
  // computation `FlaggedAnswersList`, the in-page cue and `useWorkToDo`
  // (hooks/useWorkToDo.ts) all read, so they can never disagree (item 3).
  const lastRecorded = marksStepAnswers?.lastRecorded ?? EMPTY_LAST_RECORDED;
  const flaggedAnswers: FlaggedMarksAnswer[] = useMemo(
    () =>
      deriveMarksFlags({
        alphabet: gate.alphabet,
        proposals,
        attachmentBases,
        classes,
        treatmentPrefills,
        multiMarkStacks,
        postureId,
        savedAnswers,
        lastRecorded,
      }),
    [gate.alphabet, proposals, attachmentBases, classes, treatmentPrefills, multiMarkStacks, postureId, savedAnswers, lastRecorded],
  );
  const flaggedWorkItems = useMemo(
    () =>
      flaggedAnswers.map((f) => ({
        kind: "reproposed" as const,
        stepId: STEP_ID,
        screenId: f.screenId,
        answerId: f.answerId,
        reason: f.reason,
      })),
    [flaggedAnswers],
  );
  const nextGate = useFlaggedNextGate(flaggedWorkItems, visibleStations, currentStation ?? null);

  // R-11: publish this series' stations as its walk, so the footer's
  // per-station question marks (spec 079 T061) exist.
  const publishStepWalk = useStepWalkStore((s) => s.publishStepWalk);
  useEffect(() => {
    publishStepWalk(
      STEP_ID,
      visibleStations.map((id) => ({ id, done: lastRecorded[id] !== undefined })),
    );
  }, [publishStepWalk, visibleStations, lastRecorded]);

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
  // No visible station at all is not expected once the gate is open (marks
  // are present), but guard rather than assume: stay transparent instead of
  // rendering an empty screen.
  if (currentStation === undefined) return null;
  // Narrowed past the guard above: functions declared below (hoisted, so TS
  // cannot see the guard across the closure boundary) need a definitely-typed
  // reference.
  const activeStation: MarksStationId = currentStation;

  function acceptedBasesFor(mark: string): string[] {
    const row = attachmentChecked[mark] ?? {};
    return Object.entries(row)
      .filter(([, v]) => v)
      .map(([base]) => base);
  }

  /** This station's answers, in `recordQuestionAnswers`' shape (spec 079 R-04). */
  function answersForStation(stationId: MarksStationId): SurveyAnswer[] {
    switch (stationId) {
      case "marks_attachment":
        return proposals.map((p) => ({
          questionId: `marks.marks_attachment.${p.mark}`,
          answerType: "char-list",
          value: acceptedBasesFor(p.mark),
        }));
      case "marks_treatment": {
        const out: SurveyAnswer[] = [];
        for (const prefill of treatmentPrefills) {
          out.push({
            questionId: `marks.marks_treatment.class.${prefill.classId}`,
            answerType: "select",
            value: classTreatment[prefill.classId] ?? prefill.recommended,
          });
        }
        for (const [mark, value] of Object.entries(markTreatment)) {
          out.push({
            questionId: `marks.marks_treatment.mark.${mark}`,
            answerType: "select",
            value,
          });
        }
        out.push({
          questionId: "marks.marks_treatment.promoted",
          answerType: "char-list",
          value: promoted,
        });
        out.push({
          questionId: "marks.marks_treatment.input_order",
          answerType: "select",
          value: inputOrder,
        });
        return out;
      }
      case "marks_output_form":
        return [
          { questionId: "marks.marks_output_form.form", answerType: "select", value: outputForm },
        ];
      case "marks_stacking": {
        const confirmedKeys = multiMarkStacks
          .map((s) => stackKey(s))
          .filter((key) => stacksConfirmed[key] === true);
        return [
          { questionId: "marks.marks_stacking.allowed", answerType: "boolean", value: stackingAllowed },
          { questionId: "marks.marks_stacking.stacks", answerType: "char-list", value: confirmedKeys },
        ];
      }
      default:
        return [];
    }
  }

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
        promoted: isCasedBase
          ? expandCaseCounterpartPromotions(gate.alphabet, treatment.promoted, bcp47)
          : treatment.promoted,
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
    // spec 079 R-04: every station's answers, not only the final one — the
    // decision log already no-ops on an identical repeat.
    const answers = visibleStations.flatMap((stationId) => answersForStation(stationId));
    onComplete(seriesResult(worklist, outputForm, computedAxes, answers));
  }

  /**
   * spec 079 US3 item 6 (FR-041): re-save every answer shown on `stationId`
   * with its CURRENT evidence key and `stage: "confirmed"` — this is what
   * clears a flag on confirm/overturn. `markScreenRecorded` (fired by
   * `recordScreen` below) only flips an already-`draft` answer to
   * `"confirmed"`; it does not touch `evidenceKey`, so an untouched
   * `reproposed` answer would otherwise stay flagged forever once its screen
   * is re-confirmed.
   */
  function confirmStation(stationId: MarksStationId): void {
    switch (stationId) {
      case "marks_attachment":
        for (const proposal of proposals) {
          for (const base of attachmentBases.filter((b) => b in proposal.states)) {
            const key = marksAttachmentKey(gate.alphabet, proposal.mark, base);
            const value = attachmentChecked[proposal.mark]?.[base] ?? false;
            const proposedValue = proposal.states[base] === "attested";
            saveAnswer(STEP_ID, `marks_attachment.${proposal.mark}|${base}`, {
              value,
              answerType: "boolean",
              origin: value === proposedValue ? "confirmed" : "overturned",
              stage: "confirmed",
              evidenceKey: key,
              screenId: "marks_attachment",
            });
          }
        }
        break;
      case "marks_treatment":
        for (const prefill of treatmentPrefills) {
          const markClass = classes.find((c) => c.id === prefill.classId);
          const key = marksClassTreatmentKey(markClass?.marks ?? []);
          const value = classTreatment[prefill.classId] ?? prefill.recommended;
          saveAnswer(STEP_ID, `marks_treatment.class.${prefill.classId}`, {
            value,
            answerType: "select",
            origin: value === prefill.recommended ? "confirmed" : "overturned",
            stage: "confirmed",
            evidenceKey: key,
            screenId: "marks_treatment",
          });
        }
        for (const [mark, value] of Object.entries(markTreatment)) {
          const markClass = classes.find((c) => c.marks.includes(mark));
          const key = marksMarkTreatmentKey(gate.alphabet, mark, markClass?.id ?? "");
          saveAnswer(STEP_ID, `marks_treatment.mark.${mark}`, {
            value,
            answerType: "select",
            origin: "confirmed",
            stage: "confirmed",
            evidenceKey: key,
            screenId: "marks_treatment",
          });
        }
        {
          const key = marksPromotedKey(gate.alphabet, promoted);
          saveAnswer(STEP_ID, "marks_treatment.promoted", {
            value: promoted,
            answerType: "char-list",
            origin: promoted.length === 0 ? "confirmed" : "overturned",
            stage: "confirmed",
            evidenceKey: key,
            screenId: "marks_treatment",
          });
        }
        if (orderKey !== null) {
          saveAnswer(STEP_ID, "marks_treatment.input_order", {
            value: inputOrder,
            answerType: "select",
            origin: inputOrder === seededOrder ? "confirmed" : "overturned",
            stage: "confirmed",
            evidenceKey: orderKey,
            screenId: "marks_treatment",
          });
        }
        break;
      case "marks_output_form":
        saveAnswer(STEP_ID, "marks_output_form.form", {
          value: outputForm,
          answerType: "select",
          origin: outputForm === outputFormProposal.form ? "confirmed" : "overturned",
          stage: "confirmed",
          evidenceKey: outputFormKey,
          screenId: "marks_output_form",
        });
        break;
      case "marks_stacking":
        saveAnswer(STEP_ID, "marks_stacking.allowed", {
          value: stackingAllowed,
          answerType: "boolean",
          origin: stackingAllowed === stackingProposal ? "confirmed" : "overturned",
          stage: "confirmed",
          evidenceKey: stackingKey,
          screenId: "marks_stacking",
        });
        for (const stack of multiMarkStacks) {
          const key = stackKey(stack);
          const evidenceKey = marksStackEvidenceKey(gate.alphabet, stack.marks);
          saveAnswer(STEP_ID, `marks_stacking.stack.${key}`, {
            value: stacksConfirmed[key] ?? true,
            answerType: "boolean",
            origin: "confirmed",
            stage: "confirmed",
            evidenceKey,
            screenId: "marks_stacking",
          });
        }
        break;
    }
  }

  function handleContinue(): void {
    // FR-013: Next is blocked while a flagged EARLIER station is unresolved.
    // Flags on the CURRENT station are resolved by this very Continue
    // (confirmStation below), so they never block it.
    if (nextGate.blocked) return;
    confirmStation(activeStation);
    const nextIndex = stationIndex + 1;
    if (nextIndex < visibleStations.length) {
      // Intermediate station: record its own answers now (R-04) and move on.
      // The final station's answers ride step completion instead (R-05), so
      // the mark-guards keyboard effect and the decision capture land together.
      recordScreen(activeStation, answersForStation(activeStation));
      setPosition(STEP_ID, visibleStations[nextIndex]!);
    } else {
      // Stamp the final station as the position before completing, so the
      // entries step completion records are attributed to it.
      setPosition(STEP_ID, activeStation);
      complete();
    }
  }

  function handleStationBack(): void {
    if (stationIndex > 0) {
      setPosition(STEP_ID, visibleStations[stationIndex - 1]!);
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

      {activeStation === "marks_attachment" && (
        <AttachmentStation
          proposals={proposals}
          bases={attachmentBases}
          checked={attachmentChecked}
          onToggle={handleAttachmentToggle}
          casePairCount={casePairCount}
        />
      )}

      {activeStation === "marks_treatment" && (
        <MarkTreatmentStation
          classes={classes}
          prefills={treatmentPrefills}
          answer={treatment}
          promotable={promotable}
          demoLetters={attachmentBases}
          onClassTreatmentChange={handleClassTreatmentChange}
          onMarkTreatmentChange={handleMarkTreatmentChange}
          onPromotionToggle={handlePromotionToggle}
          onInputOrderChange={handleInputOrderChange}
          orderPrefilledFromImport={prefilledFromImport && !orderExplicitlySet}
        />
      )}

      {activeStation === "marks_output_form" && (
        <OutputFormStation
          posture={posture}
          proposal={outputFormProposal}
          value={outputForm}
          onChange={handleOutputFormChange}
        />
      )}

      {activeStation === "marks_stacking" && (
        <StackingStation
          multiMarkStacks={multiMarkStacks}
          allowed={stackingAllowed}
          onAllowedChange={handleStackingAllowedChange}
          confirmed={stacksConfirmed}
          onConfirmChange={handleStackConfirmChange}
        />
      )}

      {/* spec 079 US3: a flag that appeared ON this station (a newly-relevant
          question on an already-confirmed screen) gets its cue here; earlier
          stations' flags are listed below instead (FlaggedAnswersList), since
          jumping "back into" the currently-rendered station makes no sense. */}
      {flaggedAnswers
        .filter((f) => f.screenId === activeStation)
        .map((f) => (
          <p
            key={f.answerId}
            data-testid={`marks-flag-${f.answerId}`}
            role="status"
            style={{ ...mutedParaFlush, color: ACCENT, fontSize: 13 }}
          >
            {reproposalCueMessage(f.reason, i18n)}
          </p>
        ))}

      <FlaggedAnswersList
        stepId="marks"
        items={nextGate.flaggedBefore
          .filter((w): w is Extract<typeof w, { kind: "reproposed" }> => w.kind === "reproposed")
          .map((w) => ({ answerId: w.answerId, screenId: w.screenId, reason: w.reason }))}
      />

      {nextGate.blocked && (
        <p role="status" style={{ ...mutedParaFlush, color: ACCENT, fontSize: 13 }}>
          <Trans id="survey.flagged.blocked">
            Resolve the flagged answer above before continuing.
          </Trans>
        </p>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          data-testid="marks-continue"
          onClick={handleContinue}
          disabled={nextGate.blocked}
          style={primaryButton(nextGate.blocked)}
        >
          <Trans id="survey.marks.series.continueButton">Continue</Trans>
        </button>
      </div>
    </div>
  );
};

export { MarksSeriesStep };

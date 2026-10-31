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
//
// spec 090 T023 (D-090-11): this component is the `marks-treatment` gallery
// module's renderer. The answer composite, the completion payload and the
// context-tolerance decision are recorded as the decision value through
// onChange at the same commit points the decision log is written (each
// station's Next, and completion); the module's apply runs the mark guards
// from the recorded completion payload — the retired reducer MARKS handler's
// commit point. The survey-answer store below remains spec 079's evidence
// layer (reconcile/flags), untouched.

import { useEffect, useId, useMemo, useRef, useState, type ComponentType } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import type {
  AttestedStack,
  MarksContextToleranceDecision,
  SurveyAnswer,
} from "@keyboard-studio/contracts";
import { confirmedAlphabetKey, stackKey } from "@keyboard-studio/contracts";
import {
  promotableCharacters,
  type MarkTreatment,
  type OutputForm,
  type PromotedComposedCharacter,
} from "@keyboard-studio/engine";
import type { BackspaceBehaviour, MarkInputOrder } from "@keyboard-studio/contracts";
import type { DecisionRendererProps } from "../../decisions/decisionTypes.ts";
import { useGalleryStepContext } from "../../steps/galleryHost.tsx";
import { EMPTY_MARKS_VALUE, type MarksTreatmentValue } from "./marksValue.ts";
import {
  assembleMarksSeries,
  attestedMultiMarkStacks,
  buildMarksTreatmentValue,
  computeMarksGate,
  deriveMarksBasis,
  deriveTreatmentPrefills,
  expandAttachmentsForCase,
  isCasedBaseKeyboard,
  marksSeriesAnswers,
  marksStationAnswers,
  resolveOutputStation,
  resolveStackingStation,
  resolveToleranceDecision,
  resolveTreatmentStation,
  seriesResult,
  startOfLineImportSeeded,
  startOfLineSeed,
  visibleMarksStations,
  type MarksStationState,
} from "./marksSeriesValue.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import { deriveSurveyContext } from "../../decisions/identitySelectors.ts";
import { useSurveyAnswerStore, type SavedAnswer } from "../../stores/surveyAnswerStore.ts";
import { useRecordQuestionAnswers } from "../../lib/questionRecorder.ts";
import {
  marksAttachmentKey,
  marksClassTreatmentKey,
  marksMarkTreatmentKey,
  marksStackKey as marksStackEvidenceKey,
  marksPromotedKey,
} from "../../steps/evidence.ts";
import { ATTACHMENT_SPACE, ATTACHMENT_START_OF_LINE, deriveMarksFlags, reconciledAttachmentChecked, type FlaggedMarksAnswer, type MarksStationId } from "./marksViews.ts";
import { reproposalCueMessage } from "../reproposalReason.ts";
import { FlaggedAnswersList } from "../../components/FlaggedAnswersList.tsx";
import { useFlaggedNextGate } from "../../hooks/useFlaggedNextGate.ts";
import { useStepWalkStore } from "../../stores/stepWalkStore.ts";
import { usePublishStepNav } from "../../hooks/usePublishStepNav.ts";
import { lowercaseBaseView, casedBaseCount } from "../charNormUtils.ts";
import { AttachmentStation } from "./AttachmentStation.tsx";
import { MarkTreatmentStation } from "./MarkTreatmentStation.tsx";
import { OutputFormStation } from "./OutputFormStation.tsx";
import { StackingStation } from "./StackingStation.tsx";
import { ContextToleranceStation, type ContextToleranceDecisionInput, type SiteDisclosure } from "./ContextToleranceStation.tsx";
import { toleranceProposalFor, toleranceStationShown } from "./contextToleranceProposal.ts";
import {
  ACCENT,
  TEXT_MAIN,
  FONT,
  phaseHeadingFlush,
  mutedParaFlush,
} from "../surveyStyles.ts";

// ---------------------------------------------------------------------------
// S0 — the computed gate (never rendered). Lives in marksSeriesValue.ts so a
// headless caller runs the same one; re-exported for existing importers.
// ---------------------------------------------------------------------------

export { computeMarksGate, type MarksGateResult } from "./marksSeriesValue.ts";

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
 * Re-exported from marksSeriesValue.ts (the visible-station rule uses it, and a
 * headless caller must run the same one).
 */
export { classNeedsTreatmentScreen, contextToleranceAnswers } from "./marksSeriesValue.ts";

const STEP_ID = "marks";

/** Stable empty-answers reference, so a not-yet-visited step's derived memos
 * don't recompute on every render (the alternative, `?? {}`, is a fresh
 * object literal each render). */
const EMPTY_ANSWERS: Record<string, SavedAnswer> = {};
/** Stable empty-lastRecorded reference for a not-yet-visited step, same reason
 * as {@link EMPTY_ANSWERS}. */
const EMPTY_LAST_RECORDED: Record<string, string> = {};

const MarksSeriesStep: ComponentType<DecisionRendererProps<MarksTreatmentValue>> = ({
  value: marksValueProp,
  onChange: onMarksChange,
}: DecisionRendererProps<MarksTreatmentValue>) => {
  const { onComplete, onBack } = useGalleryStepContext();
  const marksValue = marksValueProp ?? EMPTY_MARKS_VALUE;
  const { t, i18n } = useLingui();
  const alphabet = useWorkingCopyStore((s) => s.session.alphabet);
  const importedOrder = useWorkingCopyStore((s) => s.session.axes.markInputOrder);
  const startIr = useWorkingCopyStore((s) => s.startIr);
  const decisions = useDecisionStore((s) => s.decisions);
  const surveyContext = useMemo(() => deriveSurveyContext(decisions), [decisions]);
  // spec 078: the context-tolerance analysis (published by the compile gate)
  // and the decision a previous pass through this series recorded.
  const tolerance = useWorkingCopyStore((s) => s.contextTolerance);
  // spec 090 T023: the prior decision's home is the marks-treatment decision
  // value (the apply hook stamps appliedFingerprint onto the value, not the
  // phase result, so the session copy can lag it); the session derivation is
  // the fallback for drafts restored from before the value existed.
  const sessionPriorTolerance = useWorkingCopyStore((s) => s.session.marksContextTolerance);
  const priorTolerance =
    marksValueProp !== undefined ? (marksValue.contextTolerance ?? undefined) : sessionPriorTolerance;

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
  const isCasedBase = isCasedBaseKeyboard(startIr);
  // Attestation is case-symmetric behind the same gate: a mark seen only on a
  // capital must still pre-tick the lowercase row, the only one shown below,
  // and must still group with a sibling seen only on the lowercase letter.
  const basis = useMemo(
    () => deriveMarksBasis(gate.alphabet, isCasedBase, bcp47),
    [gate.alphabet, isCasedBase, bcp47],
  );
  const { classes, proposals, posture } = basis;
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

  // --- start-of-line column migration + import seeding (issue #2374) ---
  // The per-mark "start of line" box opens unticked — the new default, which
  // reproduces old `swallow` exactly (`T_` minting + the buffer-start `nul`
  // rule). Two sources pre-tick it before the author ever answers:
  //   1. a CONFIRMED legacy GuardSpecification with behaviour "emit" —
  //      migrated as ticked with origin "migrated-from-guard" (visible in
  //      the row, attributed, changeable). Confirmed "swallow" is a no-op;
  //      seeded-but-unconfirmed records are dropped (never adopted).
  //   2. a Track 2 import whose own marks are all unguarded — per-mark ticks
  //      with origin "imported", so a re-imported emit-keyboard does not
  //      silently flip to blocked at line start.
  // A saved answer always wins over the seed (reconcile); the seed origin is
  // stamped only at the row's first attachment commit. The rule itself is
  // startOfLineImportSeeded / startOfLineSeed, so a headless caller runs it too.
  const authoringTrack = decisions["authoring-track"]?.value;
  const startOfLineImportSeed = useMemo(
    () => startOfLineImportSeeded(authoringTrack, startIr),
    [authoringTrack, startIr],
  );
  const { migrated: startOfLineMigrated, defaultTicked: startOfLineDefault } = startOfLineSeed(
    marksValue,
    startOfLineImportSeed,
  );

  // --- S1 attachment: derived from the store via reconcile(), never useState ---

  // spec 079 US3 parity fix: this is the SAME `reconciledAttachmentChecked`
  // `hooks/useWorkToDo.ts` calls for the badge computation, so the two can
  // never disagree about which attachments are actually checked.
  const attachmentChecked: AttachmentChecked = useMemo(
    () => reconciledAttachmentChecked(gate.alphabet, proposals, savedAnswers, startOfLineDefault),
    [proposals, savedAnswers, gate.alphabet, startOfLineDefault],
  );

  // The case-expanded attachment map is what "reachable" means downstream: US1
  // asked only about lowercase bases, so every checked cased base additively
  // checks its uppercase counterpart (spec 049 US2 / FR-002).
  const expandedAttachments = useMemo(
    () => expandAttachmentsForCase(gate.alphabet, attachmentChecked, isCasedBase, bcp47),
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

  // The marks-treatment prefills, including the single authoritative key-budget
  // determination (spec 052 FR-016): every other report of key availability in
  // the product is a projection of that same measurement (SC-008).
  const treatmentPrefills = useMemo(
    () => deriveTreatmentPrefills({ alphabet: gate.alphabet, basis, startIr, expandedAttachments }),
    [gate.alphabet, basis, startIr, expandedAttachments],
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

  const treatmentStation = resolveTreatmentStation({
    alphabet: gate.alphabet,
    classes,
    prefills: treatmentPrefills,
    expandedAttachments,
    importedOrder,
    saved: savedAnswers,
  });
  const {
    classTreatment,
    markTreatment,
    promoted,
    inputOrder,
    seededOrder,
    prefilledFromImport,
    orderKey,
    orderExplicitlySet,
    treatment,
  } = treatmentStation;

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

  // --- S4 output form ---

  // The form SUGGESTION derives from the input order alone, the backspace
  // suggestion from the chosen form; see resolveOutputStation for the rules
  // (#2297, #2302) and the evidence keys that re-propose them.
  const outputStation = useMemo(
    () => resolveOutputStation({ posture, inputOrder, saved: savedAnswers }),
    [posture, inputOrder, savedAnswers],
  );
  const { postureId, outputFormProposal, outputFormKey, outputForm, backspaceProposal, backspaceKey, backspace } =
    outputStation;

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

  function handleBackspaceChange(next: BackspaceBehaviour): void {
    saveAnswer(STEP_ID, "marks_output_form.backspace", {
      value: next,
      answerType: "select",
      origin: next === backspaceProposal.behaviour ? "confirmed" : "overturned",
      stage: "draft",
      evidenceKey: backspaceKey,
      screenId: "marks_output_form",
    });
  }

  // S5 — stacking: evidence, the proposal and the confirmed list are resolved
  // by resolveStackingStation (FR-018/FR-019).
  const multiMarkStacks = useMemo<AttestedStack[]>(
    () => attestedMultiMarkStacks(gate.alphabet),
    [gate.alphabet],
  );
  const { stackingEvidence, stackingKey, stackingProposal, stackingAllowed, stacksConfirmed } =
    resolveStackingStation({
      alphabet: gate.alphabet,
      proposals,
      multiMarkStacks,
      saved: savedAnswers,
    });

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

  // --- context tolerance (spec 078) ---
  // The station's proposal, built from the latest analysis. `null` when there
  // is nothing to propose (no analysis yet, failed, or no fixable
  // rule; could-not-check items are never author-facing, not here either).
  const toleranceProposal = useMemo(
    () =>
      toleranceProposalFor(tolerance, {
        siteFraming: (line, key) =>
          t({ id: "marks.contextTolerance.station.site.label", message: `The ${key} key (rule on line ${line})` }),
        description: (added, sites) =>
          t({
            id: "marks.contextTolerance.station.description",
            message: plural(added, {
              one: `Adds # rule. Afterwards these ${sites} keys give the same result whether the diacritic is joined to the letter or stored as a separate character.`,
              other: `Adds # rules. Afterwards these ${sites} keys give the same result whether the diacritic is joined to the letter or stored as a separate character.`,
            }),
          }),
      }),
    [tolerance, t],
  );
  const toleranceDisclosures = useMemo<Record<string, SiteDisclosure>>(() => {
    if (tolerance.status !== "ready") return {};
    const byMarker = tolerance.proposal.disclosures ?? {};
    const out: Record<string, SiteDisclosure> = {};
    for (const v of tolerance.proposal.variants) {
      const d = byMarker[v.generatedMarker];
      if (d === undefined) continue;
      // Keyed by site id, which is the rule's site key.
      const acc = (out[tolerance.siteKeys[v.sourceRuleId] ?? v.sourceRuleId] ??= { shadows: [] });
      for (const sh of d.shadows) {
        if (!acc.shadows.some((x) => x.ruleId === sh.ruleId && x.relation === sh.relation)) acc.shadows.push(sh);
      }
      if (d.unobservable !== undefined) acc.unobservable = d.unobservable;
      if (d.markOrderNote !== undefined) acc.markOrderNote = d.markOrderNote;
    }
    return out;
  }, [tolerance]);
  const toleranceRuleLines = useMemo<Record<string, number>>(
    () =>
      tolerance.status === "ready"
        ? Object.fromEntries(tolerance.report.findings.map((f) => [f.ruleId, f.location.line]))
        : {},
    [tolerance],
  );
  // The gap findings behind the proposal, for the station's worked cases —
  // the detail the removed global notice used to show (placement model:
  // the station is the finding's only home).
  const toleranceGapFindings = useMemo(
    () =>
      tolerance.status === "ready"
        ? tolerance.report.findings.filter((f) => tolerance.classification[f.ruleId] === "gap")
        : [],
    [tolerance],
  );
  const toleranceFingerprint = tolerance.status === "ready" ? tolerance.fingerprint : undefined;
  const [toleranceDecision, setToleranceDecision] = useState<ContextToleranceDecisionInput | null>(null);
  // A decision taken against rules that have since changed no longer applies.
  useEffect(() => {
    setToleranceDecision((d) => (d !== null && d.fingerprint !== toleranceFingerprint ? null : d));
  }, [toleranceFingerprint]);
  const showToleranceStation = toleranceStationShown(tolerance, toleranceProposal);

  // --- visible stations, in series order (at most FOUR — FR-018/SC-003,
  // plus spec 078's context-tolerance station) ---
  const visibleStations: MarksStationId[] = useMemo(
    () =>
      visibleMarksStations({
        proposals,
        classes,
        posture,
        stackingEvidence,
        showToleranceStation,
      }),
    [proposals, classes, posture, stackingEvidence, showToleranceStation],
  );

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
        outputForm,
        savedAnswers,
        lastRecorded,
      }),
    [gate.alphabet, proposals, attachmentBases, classes, treatmentPrefills, multiMarkStacks, postureId, outputForm, savedAnswers, lastRecorded],
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

  // Back / Continue render in the footer (spec 081). Called unconditionally,
  // before the S0/no-station early returns below, so a skipped or
  // not-yet-open station publishes nothing rather than stale buttons.
  // `handleStationBack` / `handleContinue` are hoisted function declarations
  // (defined further down), so referencing them here is safe.
  const blockedHintId = useId();
  usePublishStepNav(
    gate.skip || currentStation === undefined
      ? {}
      : {
          ...(stationIndex > 0 || onBack !== undefined
            ? {
                back: {
                  label: t({ id: "survey.marks.series.backButton", message: "Back" }),
                  onClick: handleStationBack,
                  testId: "marks-back",
                },
              }
            : {}),
          forward: {
            label: t({ id: "survey.marks.series.continueButton", message: "Continue" }),
            onClick: handleContinue,
            testId: "marks-continue",
            disabled: nextGate.blocked,
            ...(nextGate.blocked ? { ariaDescribedBy: blockedHintId } : {}),
          },
        },
  );

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
      // spec 090 T023: the skip is a completion with no payload — record the
      // empty value when none exists (an existing value, e.g. from a pass
      // completed before the alphabet lost its marks, is left untouched,
      // exactly as the retired reducer MARKS handler left the IR untouched).
      if (marksValueProp === undefined) onMarksChange(EMPTY_MARKS_VALUE);
      if (useSurveySessionStore.getState().lastNavigation === "pop" && onBack !== undefined) {
        onBack();
      } else {
        onComplete(seriesResult());
      }
    }
  }, [gate.skip, onComplete, onBack, marksValueProp, onMarksChange]);

  if (gate.skip) return null;
  // No visible station at all is not expected once the gate is open (marks
  // are present), but guard rather than assume: stay transparent instead of
  // rendering an empty screen.
  if (currentStation === undefined) return null;
  // Narrowed past the guard above: functions declared below (hoisted, so TS
  // cannot see the guard across the closure boundary) need a definitely-typed
  // reference.
  const activeStation: MarksStationId = currentStation;

  /** Every station's answer state, for the answer records (marksStationAnswers). */
  const stationState: MarksStationState = {
    proposals,
    attachmentChecked,
    treatmentPrefills,
    classTreatment,
    markTreatment,
    promoted,
    inputOrder,
    outputForm,
    backspace,
    multiMarkStacks,
    stackingAllowed,
    stacksConfirmed,
  };

  /** This station's answers, in recordQuestionAnswers shape (spec 079 R-04). */
  function answersForStation(stationId: MarksStationId): SurveyAnswer[] {
    return marksStationAnswers(stationId, stationState);
  }

  function complete(toleranceOverride?: ContextToleranceDecisionInput): void {
    if (completedRef.current) return;
    completedRef.current = true;
    const toleranceDecision = resolvedToleranceDecision(toleranceOverride);
    // The value mirrors the session merge's last-wins semantics for the
    // tolerance decision (contracts: mergePhaseResults keeps the prior
    // decision when a result carries none): a completion reporting no
    // decision preserves the value's existing one rather than clearing
    // it — clearing would make the apply hook remove a fix the session
    // still considers decided.
    const effectiveTolerance = toleranceDecision ?? priorTolerance ?? null;
    // spec 090 T023 (D-090-11): record the completion payload in the
    // decision value BEFORE reporting completion — the gallery host runs
    // the module's apply (the mark guards) as part of the record, at the
    // same commit point the retired reducer MARKS handler ran them. The
    // R10 migration determination reads the pre-guard working IR (the exact
    // input the reducer read); MarksStepHost mirrors it into the session
    // (apply has no session channel). The assembly itself is
    // assembleMarksSeries.
    const assembled = assembleMarksSeries({
      alphabet: gate.alphabet,
      classes,
      isCasedBase,
      bcp47,
      expandedAttachments,
      treatment,
      state: stationState,
      visibleStations,
      workingIr: useWorkingCopyStore.getState().ir,
      reportedTolerance: toleranceDecision,
      effectiveTolerance,
    });
    onMarksChange(assembled.value);
    onComplete(assembled.result);
  }

  /**
   * Record the marks-treatment decision value (spec 090 T023) at an
   * intermediate commit point: the answer composite, no completion payload (an
   * answer record after a completion therefore clears it, so a stale payload
   * can never re-apply), and the context-tolerance decision the value
   * currently carries.
   */
  function recordValue(
    stationAnswers: SurveyAnswer[],
    tolerance: MarksContextToleranceDecision | null,
  ): void {
    onMarksChange(buildMarksTreatmentValue(stationAnswers, null, tolerance));
  }

  /** The context-tolerance decision to report (spec 078); see resolveToleranceDecision. */
  function resolvedToleranceDecision(
    override?: ContextToleranceDecisionInput,
  ): MarksContextToleranceDecision | undefined {
    // The station completes the series in the same event that records its
    // decision, before the state update lands, so it passes it explicitly.
    return resolveToleranceDecision({
      taken: override ?? toleranceDecision,
      priorTolerance,
      toleranceFingerprint,
    });
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
          const spaceTicked = attachmentChecked[proposal.mark]?.[ATTACHMENT_SPACE] ?? false;
          saveAnswer(STEP_ID, `marks_attachment.${proposal.mark}|${ATTACHMENT_SPACE}`, {
            value: spaceTicked,
            answerType: "boolean",
            origin: spaceTicked ? "overturned" : "confirmed",
            stage: "confirmed",
            evidenceKey: marksAttachmentKey(gate.alphabet, proposal.mark, ATTACHMENT_SPACE),
            screenId: "marks_attachment",
          });
          // Issue #2374: the start-of-line tick rides the same commit. The
          // origin is the migration/import attribution only at the row's
          // FIRST commit while the seed is what the author sees; afterwards
          // (or when the author set the tick themselves) it is the author's
          // own confirmed/overturned trajectory against the unticked default.
          const solId = `marks_attachment.${proposal.mark}|${ATTACHMENT_START_OF_LINE}`;
          const solTicked = attachmentChecked[proposal.mark]?.[ATTACHMENT_START_OF_LINE] ?? false;
          const solSeeded = savedAnswers[solId] === undefined && solTicked && startOfLineDefault;
          saveAnswer(STEP_ID, solId, {
            value: solTicked,
            answerType: "boolean",
            origin: solSeeded
              ? (startOfLineMigrated ? "migrated-from-guard" : "imported")
              : solTicked
                ? "overturned"
                : "confirmed",
            stage: "confirmed",
            evidenceKey: marksAttachmentKey(gate.alphabet, proposal.mark, ATTACHMENT_START_OF_LINE),
            screenId: "marks_attachment",
          });
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
        saveAnswer(STEP_ID, "marks_output_form.backspace", {
          value: backspace,
          answerType: "select",
          origin: backspace === backspaceProposal.behaviour ? "confirmed" : "overturned",
          stage: "confirmed",
          evidenceKey: backspaceKey,
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
      case "marks_context_tolerance":
        // spec 078: the decision rides the phase result (marksContextTolerance
        // and its answers), recorded with its own provenance at completion.
        break;
    }
  }

  function handleContinue(toleranceOverride?: ContextToleranceDecisionInput): void {
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
      // spec 090 T023: the decision value tracks the answer composite at
      // the same commit point, with no completion payload — including
      // after a completed pass, where this record is what clears the
      // stale completion (D-090-11).
      recordValue(
        marksSeriesAnswers(visibleStations, stationState),
        priorTolerance ?? null,
      );
      setPosition(STEP_ID, visibleStations[nextIndex]!);
    } else {
      // Stamp the final station as the position before completing, so the
      // entries step completion records are attributed to it.
      setPosition(STEP_ID, activeStation);
      complete(toleranceOverride);
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
          inputOrder={inputOrder}
          backspaceProposal={backspaceProposal}
          backspace={backspace}
          onBackspaceChange={handleBackspaceChange}
        />
      )}

      {activeStation === "marks_context_tolerance" && toleranceProposal === null && (
        <p data-testid="context-tolerance-checking" style={mutedParaFlush}>
          <Trans id="marks.contextTolerance.station.checking">
            Checking whether your keys also work when the letter and its diacritic are stored as separate characters.
            You can continue; the result will appear with the other messages.
          </Trans>
        </p>
      )}

      {activeStation === "marks_context_tolerance" && toleranceProposal !== null && toleranceFingerprint !== undefined && (
        <ContextToleranceStation
          proposal={toleranceProposal}
          disclosures={toleranceDisclosures}
          ruleLines={toleranceRuleLines}
          fingerprint={toleranceFingerprint}
          gapFindings={toleranceGapFindings}
          {...(priorTolerance !== undefined ? { prior: priorTolerance } : {})}
          {...(tolerance.status === "ready" && tolerance.normalizationStep !== undefined
            ? {
                step: {
                  ruleCount: tolerance.normalizationStep.ruleCount,
                  examples: tolerance.normalizationStep.examples,
                },
              }
            : {})}
          {...(tolerance.status === "ready" && tolerance.fallbackReason !== undefined
            ? { fallbackReason: tolerance.fallbackReason }
            : {})}
          onDecide={(decision) => {
            setToleranceDecision(decision);
            // Confirm (or decline) is the station's last interaction: move on.
            handleContinue(decision);
          }}
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
        <p id={blockedHintId} role="status" style={{ ...mutedParaFlush, color: ACCENT, fontSize: 13 }}>
          <Trans id="survey.flagged.blocked">
            Resolve the flagged answer above before continuing.
          </Trans>
        </p>
      )}
    </div>
  );
};

export { MarksSeriesStep };

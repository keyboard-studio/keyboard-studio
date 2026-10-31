// marksSeriesValue — how the marks series turns station answers into the
// `marks-treatment` decision value and the step's completion result, as plain
// functions. MarksSeriesStep.tsx calls every one of them; a headless caller
// (spec 107's scripted author) calls the same ones, so it never re-states a
// station default or the assembly.
//
// Pure: no React, no store. Saved answers arrive as an argument (an empty
// record means "nothing saved", i.e. every station shows the product's own
// default).
//
// THE HEADLESS FLOW (no saved answers):
//
//   1. gate     `computeMarksGate(alphabet)`; `skip` means the series
//               completes at once with `seriesResult()` and records
//               EMPTY_MARKS_VALUE (see the step's S0 effect).
//   2. basis    `isCasedBaseKeyboard(startIr)` -> `deriveMarksBasis(...)`
//               (classes, proposals via the engine's `proposeAttachments`,
//               posture). `marksStationDefaults(...)` runs 2-6 in the step's
//               own order and returns every station's default answer. The
//               start-of-line box's default comes from
//               `startOfLineSeed(value, startOfLineImportSeeded(track, startIr))`
//               and is passed in as `startOfLineDefault`.
//   3. override the case's choices on the returned state: `inputOrder`,
//               `outputForm`, `backspace`. (An override of `inputOrder` or
//               `outputForm` is applied BEFORE the stations after it are
//               resolved: pass it as `overrides` to `marksStationDefaults`,
//               which re-resolves the output-form proposal and backspace
//               default from the overridden value, exactly as the UI's
//               proposal follows the author's earlier answer.)
//   4. assemble `assembleMarksSeries(...)` -> `{ answers, completion, value,
//               result }`.
//   5. record   `value` is what the step passes to its `onChange` (the
//               marks-treatment decision value); `result` is what it passes
//               to `onComplete`.
//
// `backspaceOnDiagonal` has no station in this series: the series asks one
// whole-keyboard backspace answer (`peel` | `whole-stack`), so a case field of
// that name is not an input to anything here.

import type {
  AttestedStack,
  BackspaceBehaviour,
  ConfirmedAlphabet,
  KeyboardIR,
  MarkInputOrder,
  MarksContextToleranceDecision,
  SurveyAnswer,
  SurveyPhaseResult,
} from "@keyboard-studio/contracts";
import {
  makeConfirmedAlphabet,
  makeEmptyPlacementWorklist,
  measureKeyBudget,
  stackKey,
} from "@keyboard-studio/contracts";
import {
  groupMarkClasses,
  buildAttestationFold,
  proposeAttachments,
  nfcPostureOfInventory,
  resolveOutputFormProposal,
  resolveBackspaceProposal,
  hasDecidablePairs,
  computeMarkTreatmentPrefills,
  buildPlacementWorklist,
  expandCaseCounterpartAttachments,
  expandCaseCounterpartPromotions,
  deriveMarksComputedAxes,
  detectStartMarkMechanism,
  prunePromotions,
  treatmentFor,
  getEffectiveFacet,
  CASING_FACET_ID,
  type AttachmentProposal,
  type AttestationCaseFold,
  type BackspaceProposal,
  type MarkClass,
  type MarksComputedAxes,
  type MarkTreatment,
  type MarkTreatmentAnswer,
  type MarkTreatmentPrefill,
  type OutputForm,
  type OutputFormProposal,
  type PosturePair,
} from "@keyboard-studio/engine";
import {
  reconcile,
  marksClassTreatmentKey,
  marksMarkTreatmentKey,
  marksStackKey as marksStackEvidenceKey,
  marksOutputFormKey,
  marksBackspaceKey,
  marksInputOrderKey,
  marksPromotedKey,
  marksStackingAllowedKey,
} from "../../steps/evidence.ts";
import type { SavedAnswer } from "../../steps/answerTypes.ts";
import {
  reconciledAttachmentChecked,
  type AttachmentChecked,
  type MarksStationId,
} from "./marksViews.ts";
import { detectImportedStartOfLineSeed } from "./importedStartOfLine.ts";
import {
  legacyGuardSpecification,
  type MarksCompletion,
  type MarksTreatmentValue,
} from "./marksValue.ts";
import {
  CONTEXT_TOLERANCE_QUESTION_ID,
  CONTEXT_TOLERANCE_SITES_QUESTION_ID,
  SITE_ID_SEPARATOR,
} from "../../decisions/contextToleranceIds.ts";

// ---------------------------------------------------------------------------
// S0 gate and the station list
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

/**
 * Whether a class needs an on-screen treatment confirmation: more than one
 * mark in the class, or any of its marks reaching more than one base (attested
 * or plausible). A trivially single-pair class takes EVERY one of its answers
 * from the proposal — treatment, promotion, and order — without a screen
 * (spec 052 FR-019; SC-002: the simple orthography stays at two screens).
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

export interface VisibleStationsInput {
  proposals: readonly AttachmentProposal[];
  classes: readonly MarkClass[];
  posture: PosturePair[];
  stackingEvidence: boolean;
  /** The context-tolerance station is shown (analysis running, or a proposal exists). */
  showToleranceStation: boolean;
}

/**
 * The stations the series shows, in series order (at most four, FR-018/SC-003,
 * plus the context-tolerance station). A station with nothing to decide is
 * absent.
 */
export function visibleMarksStations(input: VisibleStationsInput): MarksStationId[] {
  const { proposals, classes, posture, stackingEvidence, showToleranceStation } = input;
  const stations: MarksStationId[] = [];
  if (proposals.length > 0) stations.push("marks_attachment");
  if (classes.some((c) => classNeedsTreatmentScreen(c, [...proposals]))) stations.push("marks_treatment");
  if (hasDecidablePairs(posture)) stations.push("marks_output_form");
  if (stackingEvidence) stations.push("marks_stacking");
  if (showToleranceStation) stations.push("marks_context_tolerance");
  return stations;
}

// ---------------------------------------------------------------------------
// Station inputs and defaults
// ---------------------------------------------------------------------------

/**
 * The GATE for "is this base cased at all" (spec 048 FR-006): the working
 * copy's `casing` facet (effective value), not a per-character Unicode test —
 * the two disagree for Georgian. "mixed" opens the gate too: everything below
 * it is per-character and leaves a caseless script's characters alone.
 */
export function isCasedBaseKeyboard(startIr: KeyboardIR | null | undefined): boolean {
  const casingValue = startIr != null ? getEffectiveFacet(startIr, CASING_FACET_ID).value : undefined;
  return casingValue === "cased" || casingValue === "mixed";
}

export interface MarksBasis {
  fold: AttestationCaseFold;
  classes: MarkClass[];
  /** The engine's attachment proposals (`proposeAttachments`). */
  proposals: AttachmentProposal[];
  posture: PosturePair[];
}

/** The engine-derived inputs every station reads, from the gate alphabet. */
export function deriveMarksBasis(
  alphabet: ConfirmedAlphabet,
  isCasedBase: boolean,
  bcp47: string | undefined,
): MarksBasis {
  const fold = buildAttestationFold(isCasedBase, bcp47);
  const classes = groupMarkClasses(alphabet, fold);
  return {
    fold,
    classes,
    proposals: proposeAttachments(alphabet, classes, fold),
    posture: nfcPostureOfInventory(alphabet),
  };
}

// ---------------------------------------------------------------------------
// The start-of-line box's default (issue #2374)
// ---------------------------------------------------------------------------

/**
 * Whether a Track 2 import seeds the per-mark "start of line" box ticked: the
 * author is adapting an existing keyboard whose own marks are all unguarded
 * (`detectImportedStartOfLineSeed`), so a re-imported emit-keyboard does not
 * silently flip to blocked at line start.
 */
export function startOfLineImportSeeded(
  authoringTrack: unknown,
  startIr: KeyboardIR | null | undefined,
): boolean {
  return authoringTrack === "adapt" && startIr != null && detectImportedStartOfLineSeed(startIr);
}

export interface StartOfLineSeed {
  /**
   * A CONFIRMED legacy guard record with behaviour "emit" migrates as ticked
   * (origin "migrated-from-guard"). Confirmed "swallow" is a no-op;
   * seeded-but-unconfirmed records are dropped (never adopted).
   */
  migrated: boolean;
  /** The box's default before the author answers: migrated, or seeded by the import. */
  defaultTicked: boolean;
}

/**
 * The per-mark "start of line" box opens unticked, which reproduces the old
 * `swallow` exactly. A migrated legacy record or the Track 2 import seed
 * (`startOfLineImportSeeded`) pre-ticks it; a saved answer always wins over
 * this default (reconcile).
 */
export function startOfLineSeed(marksValue: MarksTreatmentValue, importSeeded: boolean): StartOfLineSeed {
  const legacyGuard = legacyGuardSpecification(marksValue);
  const migrated = legacyGuard?.confirmed === true && legacyGuard.behaviour === "emit";
  return { migrated, defaultTicked: migrated || importSeeded };
}

/**
 * The case-expanded attachment map — what "reachable" means downstream: the
 * attachment station asks only about lowercase bases, so every checked cased
 * base additively checks its uppercase counterpart (spec 049 US2 / FR-002).
 */
export function expandAttachmentsForCase(
  alphabet: ConfirmedAlphabet,
  attachmentChecked: AttachmentChecked,
  isCasedBase: boolean,
  bcp47: string | undefined,
): AttachmentChecked {
  return isCasedBase
    ? expandCaseCounterpartAttachments(alphabet, attachmentChecked, bcp47)
    : attachmentChecked;
}

/** The marks-treatment prefills (`computeMarkTreatmentPrefills`) with the series' own options. */
export function deriveTreatmentPrefills(input: {
  alphabet: ConfirmedAlphabet;
  basis: Pick<MarksBasis, "classes" | "proposals" | "fold">;
  startIr: KeyboardIR | null;
  expandedAttachments: AttachmentChecked;
}): MarkTreatmentPrefill[] {
  const { alphabet, basis, startIr, expandedAttachments } = input;
  // The single authoritative key-budget determination (spec 052 FR-016): null
  // when there is no base or the base binds no stock key, which does not gate
  // promotion.
  const keyBudget = startIr != null ? measureKeyBudget(startIr) : null;
  return computeMarkTreatmentPrefills(alphabet, basis.classes, basis.proposals, {
    startIr,
    keyBudget,
    attachments: expandedAttachments,
    ...basis.fold,
  });
}

type SavedAnswers = Readonly<Record<string, SavedAnswer>>;

export interface TreatmentStationState {
  classTreatment: Record<string, MarkTreatment>;
  markTreatment: Record<string, MarkTreatment>;
  promoted: string[];
  inputOrder: MarkInputOrder;
  /** The marks that end up with a key of their own (the input-order evidence set). */
  ownKeyMarks: string[];
  hasOwnKeyMark: boolean;
  /** The order the station seeds from (the imported order when there is one, else postfix). */
  seededOrder: MarkInputOrder;
  prefilledFromImport: boolean;
  /** The evidence key of the input-order answer; null when no mark has a key of its own. */
  orderKey: ReturnType<typeof marksInputOrderKey> | null;
  orderExplicitlySet: boolean;
  /** The answer in the engine's shape (what `treatmentFor` and the worklist read). */
  treatment: MarkTreatmentAnswer;
}

/**
 * Treatment station (class/mark treatment, promotion, input order), every
 * answer reconciled against `saved` over the proposals; `saved = {}` gives the
 * product's defaults. `importedOrder` seeds the input order from the start
 * keyboard's own behaviour when one was detected.
 */
export function resolveTreatmentStation(input: {
  alphabet: ConfirmedAlphabet;
  classes: MarkClass[];
  prefills: MarkTreatmentPrefill[];
  expandedAttachments: AttachmentChecked;
  importedOrder: string | undefined;
  saved: SavedAnswers;
}): TreatmentStationState {
  const { alphabet, classes, prefills, expandedAttachments, importedOrder, saved } = input;

  const classTreatment: Record<string, MarkTreatment> = {};
  for (const prefill of prefills) {
    const markClass = classes.find((c) => c.id === prefill.classId);
    const key = marksClassTreatmentKey(markClass?.marks ?? []);
    const view = reconcile(saved[`marks_treatment.class.${prefill.classId}`], key, prefill.recommended);
    classTreatment[prefill.classId] = view.value as MarkTreatment;
  }

  const markTreatment: Record<string, MarkTreatment> = {};
  for (const mark of alphabet.marks) {
    const markClass = classes.find((c) => c.marks.includes(mark));
    if (markClass === undefined) continue;
    const savedMark = saved[`marks_treatment.mark.${mark}`];
    // A per-mark override exists only once the author sets one explicitly — an
    // unsaved override falls through to the class answer via `treatmentFor`,
    // never a proposal of its own.
    if (savedMark === undefined) continue;
    const key = marksMarkTreatmentKey(alphabet, mark, markClass.id);
    const view = reconcile(savedMark, key, savedMark.value as MarkTreatment, (v) => v);
    markTreatment[mark] = view.value as MarkTreatment;
  }

  // Keyed over the SAVED promoted list's own components' presence, not the
  // whole alphabet — an unrelated letter addition must not flag every
  // promotion (spec 079 US3 item 5, SC-003).
  const savedPromotedAnswer = saved["marks_treatment.promoted"];
  const savedPromoted = (savedPromotedAnswer?.value as string[] | undefined) ?? [];
  const promotedKey = marksPromotedKey(alphabet, savedPromoted);
  const promotedView = reconcile(savedPromotedAnswer, promotedKey, [] as string[], (s) =>
    prunePromotions(alphabet, s, expandedAttachments),
  );
  const promoted = promotedView.value;

  // Own-key resolution needs only class/mark treatment (never `inputOrder`
  // itself), so it is computed before the input-order answer.
  const ownKeyMarks = alphabet.marks.filter(
    (mark) =>
      treatmentFor(
        mark,
        { classTreatment, markTreatment, promoted, inputOrder: "postfix" },
        classes,
        prefills,
      ) === "own-key",
  );
  const hasOwnKeyMark = ownKeyMarks.length > 0;

  const prefilledFromImport = importedOrder === "prefix" || importedOrder === "postfix";
  const seededOrder: MarkInputOrder = prefilledFromImport ? (importedOrder as MarkInputOrder) : "postfix";
  // An explicitly set order is carried forward via `adjust` while still
  // applicable, and treated as inactive (kept, no flag) once no mark has a key
  // of its own to order — `currentKey = null` is reconcile()'s inactive signal.
  const orderKey = hasOwnKeyMark ? marksInputOrderKey(ownKeyMarks) : null;
  const savedOrder = saved["marks_treatment.input_order"];
  const orderView = reconcile(savedOrder, orderKey, seededOrder, (s) => s as MarkInputOrder);
  const inputOrder = orderView.value;

  return {
    classTreatment,
    markTreatment,
    promoted,
    inputOrder,
    ownKeyMarks,
    hasOwnKeyMark,
    seededOrder,
    prefilledFromImport,
    orderKey,
    orderExplicitlySet: savedOrder !== undefined,
    treatment: { classTreatment, markTreatment, promoted, inputOrder },
  };
}

/** The posture identity the output-form evidence key is built from. */
export function posturePairId(posture: readonly PosturePair[]): string {
  return [...posture]
    .map((p) => `${stackKey(p.stack)}:${p.hasReadyMadeForm ? 1 : 0}`)
    .sort()
    .join(",");
}

export interface OutputStationState {
  postureId: string;
  outputFormProposal: OutputFormProposal;
  outputFormKey: ReturnType<typeof marksOutputFormKey>;
  outputForm: OutputForm;
  backspaceProposal: BackspaceProposal;
  backspaceKey: ReturnType<typeof marksBackspaceKey>;
  backspace: BackspaceBehaviour;
}

/**
 * Output-form station: the composition answer and the backspace answer.
 *
 * The form SUGGESTION derives from the input order alone — never from
 * treatment or the posture table (#2297) — and the saved answer is reconciled
 * against the posture evidence key only, so neither an order change nor a
 * treatment change can move a confirmed composition answer. There is no clamp:
 * ready-made stays a legal answer even when some pair has no ready-made form.
 * The backspace SUGGESTION follows the chosen form (base-plus-mark = peel,
 * ready-made = whole-stack; #2302), and its evidence key carries the form so
 * changing the composition re-proposes it.
 */
export function resolveOutputStation(input: {
  posture: PosturePair[];
  inputOrder: MarkInputOrder;
  saved: SavedAnswers;
}): OutputStationState {
  const { posture, inputOrder, saved } = input;
  const postureId = posturePairId(posture);
  const outputFormProposal = resolveOutputFormProposal(posture, inputOrder);
  const outputFormKey = marksOutputFormKey(postureId);
  const outputForm = reconcile(
    saved["marks_output_form.form"],
    outputFormKey,
    outputFormProposal.form,
  ).value as OutputForm;
  const backspaceProposal = resolveBackspaceProposal(outputForm);
  const backspaceKey = marksBackspaceKey(outputForm, postureId);
  const backspace = reconcile(
    saved["marks_output_form.backspace"],
    backspaceKey,
    backspaceProposal.behaviour,
  ).value as BackspaceBehaviour;
  return {
    postureId,
    outputFormProposal,
    outputFormKey,
    outputForm,
    backspaceProposal,
    backspaceKey,
    backspace,
  };
}

/** The attested stacks of two or more marks — the stacking station's subject. */
export function attestedMultiMarkStacks(alphabet: ConfirmedAlphabet): AttestedStack[] {
  return alphabet.attestedStacks.filter((s) => s.marks.length >= 2);
}

/** Two marks' reachable base sets overlap (FR-018 evidence for the stacking station). */
export function marksReachOverlap(proposals: readonly AttachmentProposal[]): boolean {
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
}

export interface StackingStationState {
  /** An attested >=2-mark stack, or two marks' reachable base sets overlapping (FR-018). */
  stackingEvidence: boolean;
  stackingKey: ReturnType<typeof marksStackingAllowedKey>;
  /** The proposal: allowed exactly when a multi-mark stack is attested. */
  stackingProposal: boolean;
  stackingAllowed: boolean;
  /** Per multi-mark stack key, whether the author kept it (defaults to kept). */
  stacksConfirmed: Record<string, boolean>;
}

/**
 * Stacking station. The confirmed list defaults to the attested stacks
 * (propose-then-confirm), never inferred from attachment rows (FR-019). Keyed
 * over the SET of attested multi-mark stacks, not the whole alphabet (spec 079
 * US3 item 5, SC-003).
 */
export function resolveStackingStation(input: {
  alphabet: ConfirmedAlphabet;
  proposals: readonly AttachmentProposal[];
  multiMarkStacks: readonly AttestedStack[];
  saved: SavedAnswers;
}): StackingStationState {
  const { alphabet, proposals, multiMarkStacks, saved } = input;
  const stackingEvidence = multiMarkStacks.length > 0 || marksReachOverlap(proposals);
  const stackingKey = marksStackingAllowedKey(multiMarkStacks.map((s) => stackKey(s)));
  const stackingProposal = multiMarkStacks.length > 0;
  const stackingAllowed = reconcile(saved["marks_stacking.allowed"], stackingKey, stackingProposal)
    .value as boolean;
  const stacksConfirmed: Record<string, boolean> = {};
  for (const stack of multiMarkStacks) {
    const key = stackKey(stack);
    const evidenceKey = marksStackEvidenceKey(alphabet, stack.marks);
    stacksConfirmed[key] = reconcile(saved[`marks_stacking.stack.${key}`], evidenceKey, true).value as boolean;
  }
  return { stackingEvidence, stackingKey, stackingProposal, stackingAllowed, stacksConfirmed };
}

/**
 * The attested stacks the author kept (spec 106): single-mark stacks always,
 * a multi-mark stack only while stacking is allowed and that stack is ticked.
 * The completion records these, so the guard allows, and the whole-stack
 * backspace clears, exactly the stacks the stacking station confirmed.
 */
export function keptAttestedStacks(
  alphabet: ConfirmedAlphabet,
  stackingAllowed: boolean,
  stacksConfirmed: Readonly<Record<string, boolean>>,
): AttestedStack[] {
  return alphabet.attestedStacks.filter(
    (s) => s.marks.length < 2 || (stackingAllowed && stacksConfirmed[stackKey(s)] === true),
  );
}

// ---------------------------------------------------------------------------
// Station answers
// ---------------------------------------------------------------------------

/** Everything the per-station answer records read. */
export interface MarksStationState {
  proposals: readonly AttachmentProposal[];
  attachmentChecked: AttachmentChecked;
  treatmentPrefills: readonly MarkTreatmentPrefill[];
  classTreatment: Readonly<Record<string, MarkTreatment>>;
  markTreatment: Readonly<Record<string, MarkTreatment>>;
  promoted: readonly string[];
  inputOrder: MarkInputOrder;
  outputForm: OutputForm;
  backspace: BackspaceBehaviour;
  multiMarkStacks: readonly AttestedStack[];
  stackingAllowed: boolean;
  stacksConfirmed: Readonly<Record<string, boolean>>;
}

/** The bases a mark's attachment row has ticked. */
export function acceptedBasesFor(attachmentChecked: AttachmentChecked, mark: string): string[] {
  const row = attachmentChecked[mark] ?? {};
  return Object.entries(row)
    .filter(([, v]) => v)
    .map(([base]) => base);
}

/** One station's answers, in `recordQuestionAnswers`' shape (spec 079 R-04). */
export function marksStationAnswers(stationId: MarksStationId, state: MarksStationState): SurveyAnswer[] {
  switch (stationId) {
    case "marks_attachment":
      return state.proposals.map((p) => ({
        questionId: `marks.marks_attachment.${p.mark}`,
        answerType: "char-list",
        value: acceptedBasesFor(state.attachmentChecked, p.mark),
      }));
    case "marks_treatment": {
      const out: SurveyAnswer[] = [];
      for (const prefill of state.treatmentPrefills) {
        out.push({
          questionId: `marks.marks_treatment.class.${prefill.classId}`,
          answerType: "select",
          value: state.classTreatment[prefill.classId] ?? prefill.recommended,
        });
      }
      for (const [mark, value] of Object.entries(state.markTreatment)) {
        out.push({ questionId: `marks.marks_treatment.mark.${mark}`, answerType: "select", value });
      }
      out.push({
        questionId: "marks.marks_treatment.promoted",
        answerType: "char-list",
        value: [...state.promoted],
      });
      out.push({
        questionId: "marks.marks_treatment.input_order",
        answerType: "select",
        value: state.inputOrder,
      });
      return out;
    }
    case "marks_output_form":
      return [
        { questionId: "marks.marks_output_form.form", answerType: "select", value: state.outputForm },
        { questionId: "marks.marks_output_form.backspace", answerType: "select", value: state.backspace },
      ];
    case "marks_stacking": {
      const confirmedKeys = state.multiMarkStacks
        .map((s) => stackKey(s))
        .filter((key) => state.stacksConfirmed[key] === true);
      return [
        { questionId: "marks.marks_stacking.allowed", answerType: "boolean", value: state.stackingAllowed },
        { questionId: "marks.marks_stacking.stacks", answerType: "char-list", value: confirmedKeys },
      ];
    }
    default:
      return [];
  }
}

/** Every visible station's answers, in series order. */
export function marksSeriesAnswers(
  visibleStations: readonly MarksStationId[],
  state: MarksStationState,
): SurveyAnswer[] {
  return visibleStations.flatMap((stationId) => marksStationAnswers(stationId, state));
}

// ---------------------------------------------------------------------------
// Context-tolerance decision (spec 078)
// ---------------------------------------------------------------------------

/**
 * The context-tolerance decision to report (spec 078). A decision taken on
 * this pass wins (re-confirming the same outcome keeps the prior apply
 * marker); otherwise a prior decision still valid for the current rules is
 * carried forward unchanged, keeping its `appliedFingerprint` (FR-009). No
 * analysis, or an author who moved on while it was still running, records
 * nothing.
 */
export function resolveToleranceDecision(input: {
  taken: MarksContextToleranceDecision | null;
  priorTolerance: MarksContextToleranceDecision | undefined;
  toleranceFingerprint: string | undefined;
}): MarksContextToleranceDecision | undefined {
  const { taken, priorTolerance, toleranceFingerprint } = input;
  if (taken !== null) {
    const same =
      priorTolerance !== undefined &&
      priorTolerance.fingerprint === taken.fingerprint &&
      priorTolerance.decision === taken.decision &&
      priorTolerance.acceptedSiteIds.join(SITE_ID_SEPARATOR) === taken.acceptedSiteIds.join(SITE_ID_SEPARATOR);
    return same ? priorTolerance : taken;
  }
  if (priorTolerance !== undefined && priorTolerance.fingerprint === toleranceFingerprint) return priorTolerance;
  return undefined;
}

// ---------------------------------------------------------------------------
// The decision value and the completion result
// ---------------------------------------------------------------------------

/**
 * The survey answers a context-tolerance decision records (spec 078 FR-007):
 * the outcome, plus the accepted rule ids when only some were accepted.
 */
export function contextToleranceAnswers(decision: MarksContextToleranceDecision): SurveyAnswer[] {
  const answers: SurveyAnswer[] = [
    { questionId: CONTEXT_TOLERANCE_QUESTION_ID, answerType: "select", value: decision.decision },
  ];
  if (decision.decision === "partial") {
    answers.push({
      questionId: CONTEXT_TOLERANCE_SITES_QUESTION_ID,
      answerType: "text",
      value: decision.acceptedSiteIds.join(SITE_ID_SEPARATOR),
    });
  }
  return answers;
}

/**
 * The marks-treatment decision value (spec 090 T023): the answer composite in
 * record form, the completion payload (null unless the series is completing —
 * an answer record after a completion therefore clears it, so a stale payload
 * can never re-apply), and the context-tolerance decision the value currently
 * carries.
 */
export function buildMarksTreatmentValue(
  stationAnswers: readonly SurveyAnswer[],
  completion: MarksCompletion | null,
  tolerance: MarksContextToleranceDecision | null,
): MarksTreatmentValue {
  const answers: Record<string, string | string[] | boolean | undefined> = {};
  for (const a of stationAnswers) answers[a.questionId] = a.value;
  if (tolerance !== null) {
    for (const a of contextToleranceAnswers(tolerance)) answers[a.questionId] = a.value;
  }
  return { answers, completion, contextTolerance: tolerance };
}

/**
 * The series' phase result: reported on completion (or on the S0 skip). The
 * chosen output form is a real contract field (SurveyPhaseResult.marksOutputForm,
 * spec 071); carve's needed-set derivation reads it off the merged session.
 * `answers` carries every station's recorded answers (spec 079 R-04) — the
 * decision log's identical-value no-op makes the repeat free.
 */
export function seriesResult(
  worklist = makeEmptyPlacementWorklist(),
  outputForm?: OutputForm,
  computedAxes?: MarksComputedAxes,
  answers: SurveyAnswer[] = [],
  contextTolerance?: MarksContextToleranceDecision,
  backspace?: BackspaceBehaviour,
): SurveyPhaseResult {
  return {
    phase: "C",
    answers: contextTolerance !== undefined ? [...answers, ...contextToleranceAnswers(contextTolerance)] : answers,
    ...(contextTolerance !== undefined ? { marksContextTolerance: contextTolerance } : {}),
    marksWorklist: worklist,
    ...(outputForm !== undefined ? { marksOutputForm: outputForm } : {}),
    ...(backspace !== undefined ? { marksBackspace: backspace } : {}),
    // spec 052 US4: the recorded treatment finally reaches strategy selection.
    // `computedAxes` is an existing additive optional field merged into
    // session.axes by mergePhaseResults.
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

export interface AssembleMarksSeriesInput {
  alphabet: ConfirmedAlphabet;
  classes: MarkClass[];
  isCasedBase: boolean;
  bcp47: string | undefined;
  /** The case-expanded attachment map (`expandAttachmentsForCase`). */
  expandedAttachments: AttachmentChecked;
  /** The treatment answer (`TreatmentStationState.treatment`). */
  treatment: MarkTreatmentAnswer;
  /** Every station's answer state. */
  state: MarksStationState;
  visibleStations: readonly MarksStationId[];
  /** The working copy's IR at completion (the R10 determination reads it); null when none. */
  workingIr: KeyboardIR | null;
  /** The tolerance decision taken or carried on this pass, if any (reported on the phase result). */
  reportedTolerance?: MarksContextToleranceDecision | undefined;
  /** What the value records: the reported decision, else the prior one still held, else null. */
  effectiveTolerance: MarksContextToleranceDecision | null;
}

export interface AssembledMarksSeries {
  /** Every visible station's answers. */
  answers: SurveyAnswer[];
  /** The completion payload the module's apply runs the guards from. */
  completion: MarksCompletion;
  /** What the step records as the `marks-treatment` decision value. */
  value: MarksTreatmentValue;
  /** What the step passes to `onComplete`. */
  result: SurveyPhaseResult;
}

/**
 * Assemble the series' completion from the station answers (FR-020 handoff).
 *
 * The worklist's three groups cover every base and mark at least once with
 * nothing unclassified (spec 052 SC-009). The attachment map is already
 * case-expanded; the promotion set gets the same additive treatment, so
 * promoting a lowercase marked character derives its uppercase counterpart
 * (spec 052 FR-023). The computed axes project the recorded treatment onto
 * A4/A3a so strategy selection sees it (US4). `migrationNeeded` is the retired
 * reducer's R10 determination, read from the pre-guard working IR.
 */
export function assembleMarksSeries(input: AssembleMarksSeriesInput): AssembledMarksSeries {
  const {
    alphabet,
    classes,
    isCasedBase,
    bcp47,
    expandedAttachments,
    treatment,
    state,
    visibleStations,
    workingIr,
    reportedTolerance,
    effectiveTolerance,
  } = input;
  const prefills = [...state.treatmentPrefills];

  const worklist = buildPlacementWorklist({
    alphabet,
    classes,
    attachments: expandedAttachments,
    prefills,
    treatment: {
      ...treatment,
      promoted: isCasedBase
        ? expandCaseCounterpartPromotions(alphabet, treatment.promoted, bcp47)
        : treatment.promoted,
    },
  });
  const computedAxes = deriveMarksComputedAxes({ alphabet, classes, prefills, treatment });
  const answers = marksSeriesAnswers(visibleStations, state);

  const migrationNeeded =
    state.outputForm === "base-plus-mark" &&
    workingIr !== null &&
    detectStartMarkMechanism(workingIr) === "precomposed";

  const completion: MarksCompletion = {
    worklist,
    outputForm: state.outputForm,
    backspace: state.backspace,
    stacks: keptAttestedStacks(alphabet, state.stackingAllowed, state.stacksConfirmed),
    migrationNeeded,
  };
  return {
    answers,
    completion,
    value: buildMarksTreatmentValue(answers, completion, effectiveTolerance),
    result: seriesResult(worklist, state.outputForm, computedAxes, answers, reportedTolerance, state.backspace),
  };
}

// ---------------------------------------------------------------------------
// The whole default walk (no saved answers)
// ---------------------------------------------------------------------------

export interface MarksStationDefaultsInput {
  alphabet: ConfirmedAlphabet;
  startIr: KeyboardIR | null;
  bcp47: string | undefined;
  /** The start keyboard's own mark input order, when one was detected (`session.axes.markInputOrder`). */
  importedOrder?: string | undefined;
  /** The context-tolerance station is shown; the default walk has no analysis, so false unless told. */
  showToleranceStation?: boolean;
  /**
   * The start-of-line box's default (`startOfLineSeed(...).defaultTicked`):
   * false unless a migrated legacy record or the Track 2 import seeds it.
   */
  startOfLineDefault?: boolean;
  /**
   * Author choices applied on top of the defaults. `inputOrder` is applied
   * before the output-form proposal is resolved and `outputForm` before the
   * backspace proposal, so a downstream default follows the overridden answer.
   * `backspace` replaces the backspace answer.
   */
  overrides?: {
    inputOrder?: MarkInputOrder;
    outputForm?: OutputForm;
    backspace?: BackspaceBehaviour;
  };
}

/** The pieces `assembleMarksSeries` needs that the default walk can supply. */
export interface MarksStationDefaults {
  gate: MarksGateResult;
  classes: MarkClass[];
  isCasedBase: boolean;
  expandedAttachments: AttachmentChecked;
  treatment: MarkTreatmentAnswer;
  state: MarksStationState;
  visibleStations: MarksStationId[];
}

/**
 * Every station's default answer for an alphabet, resolved in the step's own
 * order with the same functions the step calls (no saved answers). Spread the
 * result into `assembleMarksSeries` with the working IR and tolerance.
 * On a skipped gate the stations are empty and `visibleStations` is `[]`.
 */
export function marksStationDefaults(input: MarksStationDefaultsInput): MarksStationDefaults {
  const { startIr, bcp47, importedOrder, overrides } = input;
  const gate = computeMarksGate(input.alphabet);
  const alphabet = gate.alphabet;
  const saved: SavedAnswers = {};
  const isCasedBase = isCasedBaseKeyboard(startIr);
  const basis = deriveMarksBasis(alphabet, isCasedBase, bcp47);
  const attachmentChecked = reconciledAttachmentChecked(
    alphabet,
    basis.proposals,
    saved,
    input.startOfLineDefault === true,
  );
  const expandedAttachments = expandAttachmentsForCase(alphabet, attachmentChecked, isCasedBase, bcp47);
  const treatmentPrefills = deriveTreatmentPrefills({ alphabet, basis, startIr, expandedAttachments });
  const t = resolveTreatmentStation({
    alphabet,
    classes: basis.classes,
    prefills: treatmentPrefills,
    expandedAttachments,
    importedOrder,
    saved,
  });
  const inputOrder = overrides?.inputOrder ?? t.inputOrder;
  const treatment: MarkTreatmentAnswer = { ...t.treatment, inputOrder };

  // A form override is applied as the saved composition answer, so the
  // backspace default follows it exactly as it follows the author's pick.
  const outputSaved: Record<string, SavedAnswer> = {};
  if (overrides?.outputForm !== undefined) {
    outputSaved["marks_output_form.form"] = overrideAnswer(
      overrides.outputForm,
      marksOutputFormKey(posturePairId(basis.posture)),
    );
  }
  const out = resolveOutputStation({ posture: basis.posture, inputOrder, saved: outputSaved });
  const backspace = overrides?.backspace ?? out.backspace;

  const multiMarkStacks = attestedMultiMarkStacks(alphabet);
  const stacking = resolveStackingStation({ alphabet, proposals: basis.proposals, multiMarkStacks, saved });

  const visibleStations = gate.skip
    ? []
    : visibleMarksStations({
        proposals: basis.proposals,
        classes: basis.classes,
        posture: basis.posture,
        stackingEvidence: stacking.stackingEvidence,
        showToleranceStation: input.showToleranceStation === true,
      });

  return {
    gate,
    classes: basis.classes,
    isCasedBase,
    expandedAttachments,
    treatment,
    visibleStations,
    state: {
      proposals: basis.proposals,
      attachmentChecked,
      treatmentPrefills,
      classTreatment: t.classTreatment,
      markTreatment: t.markTreatment,
      promoted: t.promoted,
      inputOrder,
      outputForm: out.outputForm,
      backspace,
      multiMarkStacks,
      stackingAllowed: stacking.stackingAllowed,
      stacksConfirmed: stacking.stacksConfirmed,
    },
  };
}

function overrideAnswer(value: string, evidenceKey: string): SavedAnswer {
  return {
    value,
    answerType: "select",
    origin: "overturned",
    stage: "confirmed",
    evidenceKey,
    screenId: "marks_output_form",
    savedAt: 0,
  };
}

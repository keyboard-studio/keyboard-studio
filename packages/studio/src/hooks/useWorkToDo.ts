// useWorkToDo — assembles `steps/workToDo.ts`'s `selectWorkToDo()` input from
// the live stores (spec 079 US3 R-10).
//
// `selectWorkToDo()` itself stays pure and store-free (steps/ may not import
// stores/); this hook is the one place that reads `surveyAnswerStore`,
// `workingCopyStore` and the mark-aware `useAccountedForGate()` and hands them
// to it. `FlaggedAnswersList` and the journey-strip badges (a later agent's
// T062) both read this hook's result, so a badge can never disagree with a
// step's own in-page flag.
//
// MARKS is wired today. Characters/punctuation/invisibles/convenience land as
// each of those steps grows the same `deriveXFlags()` pure module marks has
// (`survey/marks/marksViews.ts`) — see the `TODO(079-US3)` markers below for
// the seam. Convenience's `not-asked` contribution IS wired, because its tri-
// state gate (`survey/convenience/convenienceGate.ts`) already exists and is
// explicitly pure/store-free for this purpose (see that module's own header).

import { useMemo } from "react";
import { buildProducedSet, measureKeyBudget, nonAlphabetConfirmedInventory, stackKey } from "@keyboard-studio/contracts";
import {
  groupMarkClasses,
  proposeAttachments,
  computeMarkTreatmentPrefills,
  nfcPostureOfInventory,
  expandCaseCounterpartAttachments,
  getEffectiveFacet,
  CASING_FACET_ID,
} from "@keyboard-studio/engine";
import { deriveMarksFlags, reconciledAttachmentChecked } from "../survey/marks/marksViews.ts";
import { deriveCharacterFlags } from "../survey/characterFlags.ts";
import { derivePunctuationFlags } from "../survey/punctuation/punctuationFlags.ts";
import { useSourcedExemplars } from "../survey/useSourcedExemplars.ts";
import { punctuationKey } from "../steps/evidence.ts";
import { usePhaseBDraftStore } from "../stores/phaseBDraftStore.ts";
import { selectWorkToDo, type WorkItem, type NotAskedGateInput, type FlaggedAnswerInput } from "../steps/workToDo.ts";
import type { StepId } from "../steps/answerTypes.ts";
import { computeConvenienceGate } from "../survey/convenience/convenienceGate.ts";
import { lowercaseBaseView } from "../survey/charNormUtils.ts";
import { useSurveyAnswerStore } from "../stores/surveyAnswerStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { useAccountedForGate } from "./useAccountedForGate.ts";
import { useCarveNeededSet } from "./useCarveNeededSet.ts";
import { deriveCarveNeededSet } from "@keyboard-studio/engine";

const EMPTY_ANSWERS = {};
const EMPTY_LAST_RECORDED = {};

/** This step's work-to-do, live. Re-derives on every relevant store change. */
export function useWorkToDo(): Record<StepId, WorkItem[]> {
  const alphabet = useWorkingCopyStore((s) => s.session.alphabet);
  const baseIr = useWorkingCopyStore((s) => s.baseIr);
  const ir = useWorkingCopyStore((s) => s.ir);
  const instantiationMode = useWorkingCopyStore((s) => s.instantiationMode);
  const bcp47 = useSurveySessionStore((s) => s.surveyContext.bcp47_tag);
  const marksStepAnswers = useSurveyAnswerStore((s) => s.steps.marks);
  const charactersStepAnswers = useSurveyAnswerStore((s) => s.steps.characters);
  const alphabetEvidenceKey = usePhaseBDraftStore((s) => s.alphabetEvidenceKey);
  const punctuationInventoryAnswer = useSurveyAnswerStore(
    (s) => s.steps.punctuation?.answers["punctuation.inventory"],
  );
  const baseKeyboard = useWorkingCopyStore((s) => s.baseKeyboard);
  const { inventory: punctuationInventory } = useSourcedExemplars(bcp47);
  const convenienceStatus = useSurveyAnswerStore((s) => s.steps.convenience?.status);
  const accounted = useAccountedForGate();
  const { neededSet, hasSignal } = useCarveNeededSet();

  const marksFlagged = useMemo<readonly FlaggedAnswerInput[]>(() => {
    if (alphabet === undefined || alphabet.marks.length === 0) return [];
    const classes = groupMarkClasses(alphabet);
    const proposals = proposeAttachments(alphabet, classes);
    const casingValue = baseIr != null ? getEffectiveFacet(baseIr, CASING_FACET_ID).value : undefined;
    const isCasedBase = casingValue === "cased" || casingValue === "mixed";
    const attachmentBases = isCasedBase ? lowercaseBaseView(alphabet.bases, bcp47) : alphabet.bases;
    const keyBudget = baseIr != null ? measureKeyBudget(baseIr) : null;
    // spec 079 US3 parity fix: reconcile against the SAME saved answers
    // `MarksSeriesStep.tsx` itself renders from (`reconciledAttachmentChecked`,
    // marksViews.ts) — not the raw proposal default, which disagreed with the
    // step whenever the author had overturned an attachment.
    const defaultAttachments = reconciledAttachmentChecked(
      alphabet,
      proposals,
      marksStepAnswers?.answers ?? EMPTY_ANSWERS,
    );
    const expandedAttachments = isCasedBase
      ? expandCaseCounterpartAttachments(alphabet, defaultAttachments, bcp47)
      : defaultAttachments;
    const treatmentPrefills = computeMarkTreatmentPrefills(alphabet, classes, proposals, {
      baseIr,
      keyBudget,
      attachments: expandedAttachments,
      ...(bcp47 !== undefined ? { bcp47 } : {}),
    });
    const multiMarkStacks = alphabet.attestedStacks.filter((s) => s.marks.length >= 2);
    const posture = nfcPostureOfInventory(alphabet);
    const postureId = [...posture].map((p) => `${stackKey(p.stack)}:${p.hasReadyMadeForm ? 1 : 0}`).sort().join(",");
    return deriveMarksFlags({
      alphabet,
      proposals,
      attachmentBases,
      classes,
      treatmentPrefills,
      multiMarkStacks,
      postureId,
      savedAnswers: marksStepAnswers?.answers ?? EMPTY_ANSWERS,
      lastRecorded: marksStepAnswers?.lastRecorded ?? EMPTY_LAST_RECORDED,
    });
  }, [alphabet, baseIr, bcp47, marksStepAnswers]);

  const charactersFlagged = useMemo<readonly FlaggedAnswerInput[]>(
    () => deriveCharacterFlags(charactersStepAnswers?.answers ?? EMPTY_ANSWERS, alphabetEvidenceKey ?? ""),
    [charactersStepAnswers, alphabetEvidenceKey],
  );

  const punctuationFlagged = useMemo<readonly FlaggedAnswerInput[]>(
    () => derivePunctuationFlags(punctuationInventoryAnswer, punctuationKey(punctuationInventory?.resolvedTag, baseKeyboard?.id)),
    [punctuationInventoryAnswer, punctuationInventory, baseKeyboard],
  );

  // TODO(079-US3): invisibles/convenience never have a `reproposed` answer to
  // flag — see survey/invisiblesFlags.ts and survey/convenience/
  // convenienceFlags.ts for why (their per-answer keys are either "still
  // offered" or "no longer offered", never "offered under different
  // evidence") — so there is nothing for either to contribute here.

  const notAsked = useMemo<Record<StepId, NotAskedGateInput>>(() => {
    const out: Record<StepId, NotAskedGateInput> = {};
    if (convenienceStatus?.kind === "not-asked") {
      const produced = ir !== null ? buildProducedSet(ir) : new Set<string>();
      const gate = computeConvenienceGate({
        produced,
        needed: neededSet,
        hasSignal,
        instantiated: instantiationMode !== null,
      });
      out.convenience = {
        reason: {
          code: "now-applicable",
          subject: convenienceStatus.reason.code,
          sourceStepId: "convenience",
        },
        // `applies` is the only outcome that makes a `not-asked` step
        // "now applicable" (FR-067) — `not-applicable` (still nothing to ask,
        // e.g. CONVENIENCE_REASON_NO_SURPLUS) and `unknown` both leave it be.
        gateApplies: gate.kind === "applies",
      };
    }
    return out;
  }, [convenienceStatus, ir, neededSet, hasSignal, instantiationMode]);

  return useMemo(
    () =>
      selectWorkToDo({
        flagged: { marks: marksFlagged, characters: charactersFlagged, punctuation: punctuationFlagged },
        unaccounted: { mechanisms: accounted.unaccountedDesktop.length, touch: accounted.unaccountedTouch.length },
        notAsked,
      }),
    [marksFlagged, charactersFlagged, punctuationFlagged, accounted, notAsked],
  );
}

// ---------------------------------------------------------------------------
// readWorkToDo — a non-reactive snapshot, safe to call OUTSIDE a component.
// ---------------------------------------------------------------------------

/**
 * Non-reactive snapshot of work-to-do (spec 079 US3 item 6), for a caller
 * that must run outside render — e.g. `StepHost.tsx`'s FR-016 notice, which
 * compares a before/after snapshot around one Next and cannot itself be a
 * hook call bracketing a store mutation.
 *
 * Covers ONLY the kinds this module can compute from `getState()` alone:
 *
 *  - `marks` and `characters` `reproposed` flags — both pure reads plus pure
 *    functions (`deriveMarksFlags`/`reconciledAttachmentChecked`,
 *    `deriveCharacterFlags`), no hook needed.
 *  - `convenience`'s `not-asked` -> `applies` transition — approximated with
 *    the SYNCHRONOUS half of `useCarveNeededSet`'s needed-set (the tiered
 *    marks-series + confirmed-inventory union via `deriveCarveNeededSet`),
 *    omitting the asynchronous CLDR/SLDR `neededChars` enhancement (no
 *    synchronous cache accessor exists in `lib/services.ts`). This can only
 *    UNDER-report — the live hook's set is a superset once the async lookup
 *    settles — so this never claims "applies" the live hook wouldn't also
 *    reach; it may just lag by one CLDR-only signal until the notice's own
 *    next comparison.
 *
 * Deliberately NOT covered, and not approximated:
 *
 *  - `punctuation`'s flag — `derivePunctuationFlags` needs the CURRENT
 *    sourced-exemplar inventory (`useSourcedExemplars`), which is async with
 *    no synchronous cache accessor. A guessed or stale value would be worse
 *    than an honest omission for a before/after diff.
 *  - `unassigned` (mechanisms/touch) — `useAccountedForGate` composes
 *    `useInventoryCoverageGate`, itself a hook with no `getState()`
 *    equivalent.
 *
 * A caller needing the full picture (punctuation + unassigned counts) must
 * use the `useWorkToDo()` hook inside a component instead.
 */
export function readWorkToDo(): Record<StepId, WorkItem[]> {
  const workingCopy = useWorkingCopyStore.getState();
  const surveySession = useSurveySessionStore.getState();
  const surveyAnswers = useSurveyAnswerStore.getState();

  const alphabet = workingCopy.session.alphabet;
  const baseIr = workingCopy.baseIr;
  const bcp47 = surveySession.surveyContext.bcp47_tag;
  const marksStepAnswers = surveyAnswers.steps.marks;

  let marksFlagged: readonly FlaggedAnswerInput[] = [];
  if (alphabet !== undefined && alphabet.marks.length > 0) {
    const classes = groupMarkClasses(alphabet);
    const proposals = proposeAttachments(alphabet, classes);
    const casingValue = baseIr != null ? getEffectiveFacet(baseIr, CASING_FACET_ID).value : undefined;
    const isCasedBase = casingValue === "cased" || casingValue === "mixed";
    const attachmentBases = isCasedBase ? lowercaseBaseView(alphabet.bases, bcp47) : alphabet.bases;
    const keyBudget = baseIr != null ? measureKeyBudget(baseIr) : null;
    const reconciled = reconciledAttachmentChecked(alphabet, proposals, marksStepAnswers?.answers ?? EMPTY_ANSWERS);
    const expandedAttachments = isCasedBase
      ? expandCaseCounterpartAttachments(alphabet, reconciled, bcp47)
      : reconciled;
    const treatmentPrefills = computeMarkTreatmentPrefills(alphabet, classes, proposals, {
      baseIr,
      keyBudget,
      attachments: expandedAttachments,
      ...(bcp47 !== undefined ? { bcp47 } : {}),
    });
    const multiMarkStacks = alphabet.attestedStacks.filter((s) => s.marks.length >= 2);
    const posture = nfcPostureOfInventory(alphabet);
    const postureId = [...posture].map((p) => `${stackKey(p.stack)}:${p.hasReadyMadeForm ? 1 : 0}`).sort().join(",");
    marksFlagged = deriveMarksFlags({
      alphabet,
      proposals,
      attachmentBases,
      classes,
      treatmentPrefills,
      multiMarkStacks,
      postureId,
      savedAnswers: marksStepAnswers?.answers ?? EMPTY_ANSWERS,
      lastRecorded: marksStepAnswers?.lastRecorded ?? EMPTY_LAST_RECORDED,
    });
  }

  const charactersFlagged = deriveCharacterFlags(
    surveyAnswers.steps.characters?.answers ?? EMPTY_ANSWERS,
    usePhaseBDraftStore.getState().alphabetEvidenceKey ?? "",
  );

  const notAsked: Record<StepId, NotAskedGateInput> = {};
  const convenienceStatus = surveyAnswers.steps.convenience?.status;
  if (convenienceStatus?.kind === "not-asked") {
    const carveNeeded = deriveCarveNeededSet({
      alphabet,
      worklist: workingCopy.session.marksWorklist,
      ...(workingCopy.session.marksOutputForm !== undefined
        ? { outputForm: workingCopy.session.marksOutputForm }
        : {}),
    });
    const nonAlphabetConfirmed = nonAlphabetConfirmedInventory(
      workingCopy.session.confirmedInventory,
      alphabet,
    );
    const tieredNeededSet = new Set([
      ...carveNeeded.requiredPrimary,
      ...carveNeeded.optionalSecondary,
      ...nonAlphabetConfirmed,
    ]);
    const produced = workingCopy.ir !== null ? buildProducedSet(workingCopy.ir) : new Set<string>();
    const gate = computeConvenienceGate({
      produced,
      needed: tieredNeededSet,
      hasSignal: tieredNeededSet.size > 0,
      instantiated: workingCopy.instantiationMode !== null,
    });
    notAsked.convenience = {
      reason: {
        code: "now-applicable",
        subject: convenienceStatus.reason.code,
        sourceStepId: "convenience",
      },
      gateApplies: gate.kind === "applies",
    };
  }

  return selectWorkToDo({
    flagged: { marks: marksFlagged, characters: charactersFlagged },
    unaccounted: { mechanisms: 0, touch: 0 },
    notAsked,
  });
}

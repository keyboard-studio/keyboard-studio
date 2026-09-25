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
import { buildProducedSet, measureKeyBudget, stackKey } from "@keyboard-studio/contracts";
import {
  groupMarkClasses,
  proposeAttachments,
  computeMarkTreatmentPrefills,
  nfcPostureOfInventory,
  expandCaseCounterpartAttachments,
  getEffectiveFacet,
  CASING_FACET_ID,
} from "@keyboard-studio/engine";
import { deriveMarksFlags, initialAttachmentChecked } from "../survey/marks/marksViews.ts";
import { selectWorkToDo, type WorkItem, type NotAskedGateInput, type FlaggedAnswerInput } from "../steps/workToDo.ts";
import type { StepId } from "../steps/answerTypes.ts";
import { computeConvenienceGate } from "../survey/convenience/convenienceGate.ts";
import { lowercaseBaseView } from "../survey/charNormUtils.ts";
import { useSurveyAnswerStore } from "../stores/surveyAnswerStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { useAccountedForGate } from "./useAccountedForGate.ts";
import { useCarveNeededSet } from "./useCarveNeededSet.ts";

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
    // No saved-answer reconciliation here (this hook has no render-time
    // interaction) — the default (proposal-derived) attachment view is a
    // reasonable stand-in for treatmentPrefills' own purposes: which classes
    // exist and what they'd recommend, not this hook's own displayed value.
    const defaultAttachments = initialAttachmentChecked(proposals);
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

  // TODO(079-US3): characters/punctuation/invisibles contribute their own
  // flagged lists here once each grows a `deriveXFlags()` pure module
  // mirroring `survey/marks/marksViews.ts` (T080, a later agent's task).

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
        flagged: { marks: marksFlagged },
        unaccounted: { mechanisms: accounted.unaccountedDesktop.length, touch: accounted.unaccountedTouch.length },
        notAsked,
      }),
    [marksFlagged, accounted, notAsked],
  );
}

// studioReducerDeps — the store-backed ReducerDeps the studio injects into
// StepHost (steps/reducer.ts imports no stores), lifted out of StudioShell's
// useMemo blocks (spec 107 FR-040) so the UI and the headless author complete
// steps with the same deps. StudioShell holds the results in a ref / memo;
// the factories themselves are unchanged from the inline versions.

import type { StartKeyboard } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSurveyAnswerStore, peekStepAnswers } from "../stores/surveyAnswerStore.ts";
import { useDecisionStore, getDecisionSnapshot } from "../stores/decisionStore.ts";
import type { ReducerDeps } from "../steps/reducer.ts";
import { createStudioDecisionRecorder } from "../decisions/createStudioDecisionRecorder.ts";
import { rebuildWorkingCopyFromStores } from "../decisions/rebuildWorkingCopy.ts";
import { createSourceSnapshotter, type SourceSnapshotter } from "../decisions/snapshotSource.ts";
import { instantiateFromStartIfConfirmed, instantiateFromExistingWithIdentitySeed } from "./confirmRebase.ts";
import { projectWorkingCopyForOutput } from "./serializeWorkingCopy.ts";
import { journalDecisionWrite } from "./decisionJournal.ts";
import { applyPatchToWorkingCopy, irForApply } from "./applyPatchToWorkingCopy.ts";

/**
 * The decision-audit snapshotter (spec 053). `readProjectedFiles` delegates
 * to `projectWorkingCopyForOutput` — the SAME function the download zip and
 * the pull-request path use (FR-009/SC-005: the text the audit diffs must be
 * the text that ships). STATEFUL: it carries the previous boundary's text, so
 * the caller holds one instance per session.
 */
export function createStudioSnapshotter(): SourceSnapshotter {
  return createSourceSnapshotter({
    readProjectedFiles: async () => {
      const projected = await projectWorkingCopyForOutput();
      return projected === null ? null : { entries: projected.vfs.entries() };
    },
  });
}

export type StudioRecordDecision = ReturnType<typeof createStudioDecisionRecorder>;

/** The `recordDecision` dep (spec 053), store-derived over the session snapshotter. */
export function createStudioRecordDecision(snapshotter: SourceSnapshotter): StudioRecordDecision {
  return createStudioDecisionRecorder({
    getWorkingCopyState: () => useWorkingCopyStore.getState(),
    snapshotter,
    // spec 080 R-04: the answer store learns which screen each entry was
    // recorded on (journey-strip grouping) and each screen's last hash
    // (FR-040 "a Next with no change records nothing").
    onScreenRecorded: (stepId, screenId, entryIds, hash) => {
      const answers = useSurveyAnswerStore.getState();
      answers.markScreenRecorded(stepId, screenId, hash);
      for (const entryId of entryIds)
        answers.setRecordedScreen(entryId, screenId);
    },
    getLastRecordedHash: (stepId, screenId) =>
      useSurveyAnswerStore.getState().steps[stepId]?.lastRecorded[screenId],
    resolveCompletionScreen: (stepId) =>
      useSurveyAnswerStore.getState().steps[stepId]?.position ?? stepId,
    getSavedAnswer: (stepId, questionId) =>
      useSurveyAnswerStore.getState().steps[stepId]?.answers[questionId],
    // spec 090 US5: the recorder resolves each completing step's
    // settled gallery decisions against the live decision set.
    getDecisions: () => getDecisionSnapshot(),
  });
}

/**
 * Clear the touch_seed_source fork choice on a genuine base re-instantiation
 * (spec 035 R12, re-homed by spec 088 T026). The choice is the
 * `touch-seed-source` DECISION: clearing removes the record AND clears the
 * working copy's touch draft (research D-06).
 */
export function clearTouchSeedChoice(): void {
  useDecisionStore.getState().forget("touch-seed-source");
  useWorkingCopyStore.getState().setTouchDraft(null);
}

export interface StudioReducerDepsInput {
  instantiateFromStart: (base: StartKeyboard, opts: Parameters<ReducerDeps["instantiateFromStart"]>[1]) => void;
  clearTouchSeedChoice: () => void;
  recordDecision: StudioRecordDecision;
}

/**
 * ReducerDeps — injected into applyStepCompletion (steps/reducer.ts). All
 * store actions and lib helpers are injected here; the reducer itself has no
 * static imports from stores/ or lib/ (boundary compliance).
 */
export function createStudioReducerDeps(input: StudioReducerDepsInput): ReducerDeps {
  const { instantiateFromStart, clearTouchSeedChoice: clearSeed, recordDecision } = input;
  return {
    instantiateFromStart,
    // Track 2 (adapt): the seeded wrapper, not the raw store action — the
    // adapt instantiation must carry the author's identity-language seed
    // (composed tag + English name) or the emitted descriptor falls back
    // to the base's raw tag as the <Language> display text. Module-level
    // import, like instantiateFromStartIfConfirmed below.
    instantiateFromExisting: (base, opts) =>
      instantiateFromExistingWithIdentitySeed(base, opts),
    clearTouchSeedChoice: clearSeed,
    // Spec 035 R11: the emission-matrix wrapper that used to live here
    // (as the buildTouchLayoutJson dep) moved verbatim into
    // lib/assignLoopCompletion.ts at spec 090 T042 with the R2 build.
    instantiateFromStartIfConfirmed: (base, opts, options) =>
      instantiateFromStartIfConfirmed(base, opts, options),
    // spec-014 mutate seam (T014): read/write the working-copy carve IR for
    // the reducer's path-scoped mutate() apply. Read via getState() (stable,
    // no re-render churn); write via the OVERLAY-PRESERVING setWorkingIR action.
    // These are INCREMENTAL patches to the working IR (mutate-apply US1 +
    // touch re-propagation US2), not base replacements, so they must NOT clear
    // the carve-deletion overlay (setIR would). See workingCopyStore.setWorkingIR.
    getWorkingIR: irForApply,
    setWorkingIR: (next) => useWorkingCopyStore.getState().setWorkingIR(next),
    // Spec 053 FR-001/FR-002: record every step's decisions. Injected like
    // everything else here; the reducer knows only that it has a callback.
    recordDecision,
    recordQuestionAnswers: recordDecision.recordQuestionAnswers,
    // Spec 088 FR-003 (contract C-2): the completion writer's decision
    // store access, injected so steps/reducer.ts never imports stores/.
    writeDecisionRecords: (records) => {
      journalDecisionWrite(records.map((r) => r.id));
      useDecisionStore.getState().recordAll(records);
    },
    readDecisionSet: () => getDecisionSnapshot(),
    // Spec 093 T009 (Copy): after a completion records decisions, recalculate
    // the downstream closure and rebuild the working copy by replay.
    // On a keyboard opened for update this is a NO-OP (spec 111 FR-042): the
    // decisions are already recorded and `rebuildWorkingCopyFromStores`
    // returns before replaying anything over the files. Nothing is lost: a
    // later switch to Copy instantiates a new working copy and reseeds from
    // the recorded decisions.
    rebuildFromDecisions: (changed) => {
      rebuildWorkingCopyFromStores(changed);
    },
    // Spec 089 FR-001/FR-002 (apply-contract A4): the checked patch sink, one
    // function shared with the gallery host (`applyPatchToWorkingCopy`), which
    // also routes the `ir` channel through the apply seam on Open (spec 111).
    applyWorkingCopyPatch: applyPatchToWorkingCopy,
    getDecisions: () => getDecisionSnapshot(),
    getHistoryEntryState: () => useWorkingCopyStore.getState().historyEntryState,
    getDocFixProposals: () => useWorkingCopyStore.getState().docFixProposals,
    getSavedAnswer: (stepId, questionId) => peekStepAnswers(stepId)?.answers[questionId],
    getStartKeyboardId: () => useWorkingCopyStore.getState().startKeyboard?.id,
  };
}

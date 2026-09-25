// surveyAnswerStore — every survey question's saved answer, the author's
// position inside each step, and each step's status (spec 079 R-01,
// data-model.md §1, contracts/answer-store-contract.md §1).
//
// THE RULE THIS STORE EXISTS FOR: an answer is saved when it is given (FR-001).
// `saveAnswer` is called synchronously from a question's change handler — never
// from an unmount or a Next — so leaving a step, finished or not, loses nothing
// (FR-002), and rapid Back/Forward is safe by construction.
//
// What it is NOT:
//   - not the decision record. The record says what was DECIDED, at each Next
//     (decisionLogStore); this holds what was GIVEN, including drafts.
//   - not traversal. `surveySessionStore` stays the single "where am I" across
//     steps (spec 026); `position` here is only where the author is INSIDE a step.
//   - not a re-proposal engine. A shape change never writes here; `reconcile()`
//     (steps/evidence.ts) is a pure read over what is saved (R-03).
//
// Persistence: folded into the durable draft as `DurableDraft.surveyAnswers`
// (lib/draftPersistence.ts), on the existing autosave timer — no timer here.
//
// `reset()` is called ONLY from start-over (StudioShell `handleStartOver`) and
// new project (WelcomeScreen "Continue as guest") — FR-033, asserted by
// surveyAnswerStore.test.ts.

import { create } from "zustand";
import type {
  AnswerId,
  SavedAnswer,
  ScreenId,
  StepAnswers,
  StepId,
  StepStatus,
  SurveyAnswerSnapshot,
} from "../steps/answerTypes.ts";

export type {
  AnswerId,
  AnswerView,
  EvidenceKey,
  NotAskedReason,
  ReproposalReason,
  SavedAnswer,
  SavedValue,
  ScreenId,
  StepAnswers,
  StepId,
  StepStatus,
  SurveyAnswerSnapshot,
} from "../steps/answerTypes.ts";

export interface SurveyAnswerState extends SurveyAnswerSnapshot {
  /** Save one answer. Synchronous; call it from the change handler (FR-001). */
  saveAnswer: (stepId: StepId, answerId: AnswerId, a: Omit<SavedAnswer, "savedAt">) => void;
  /**
   * Replace ALL of `stepId`'s answers. For a step whose answer set is defined by
   * its own walk (SurveyRunner): changing an earlier answer invalidates the
   * questions walked after it, and their stale answers must not be replayed.
   * Unchanged answers keep their `savedAt` and `stage`; a no-op when nothing
   * differs.
   */
  setStepAnswers: (stepId: StepId, answers: Record<AnswerId, Omit<SavedAnswer, "savedAt">>) => void;
  /** Record where the author is inside `stepId` (FR-004). A no-op when unchanged. */
  setPosition: (stepId: StepId, pos: string | null) => void;
  setStatus: (stepId: StepId, s: StepStatus) => void;
  /**
   * A screen's Next was recorded: remember its answers' hash (FR-040) and move
   * that screen's draft answers to `stage: "confirmed"` (FR-008).
   */
  markScreenRecorded: (stepId: StepId, screenId: ScreenId, hash: string) => void;
  /** Remember which screen decision entry `entryId` was recorded on. */
  setRecordedScreen: (entryId: string, screenId: ScreenId) => void;
  /** Start over / new project only (FR-033). */
  reset: () => void;
}

function emptyStep(): StepAnswers {
  return { answers: {}, position: null, status: { kind: "in-progress" }, lastRecorded: {} };
}

function sameValue(a: SavedAnswer["value"], b: SavedAnswer["value"]): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return a === b;
}

/** Field equality ignoring `savedAt`, so a no-change save does not notify subscribers. */
function sameAnswer(prev: SavedAnswer | undefined, next: Omit<SavedAnswer, "savedAt">): boolean {
  return (
    prev !== undefined &&
    sameValue(prev.value, next.value) &&
    prev.answerType === next.answerType &&
    prev.origin === next.origin &&
    prev.stage === next.stage &&
    prev.evidenceKey === next.evidenceKey &&
    prev.screenId === next.screenId
  );
}

export const useSurveyAnswerStore = create<SurveyAnswerState>((set) => ({
  steps: {},
  recordedScreenOf: {},

  saveAnswer: (stepId, answerId, a) =>
    set((s) => {
      const step = s.steps[stepId] ?? emptyStep();
      if (sameAnswer(step.answers[answerId], a)) return s;
      const answers = { ...step.answers, [answerId]: { ...a, savedAt: Date.now() } };
      return { steps: { ...s.steps, [stepId]: { ...step, answers } } };
    }),

  setStepAnswers: (stepId, next) =>
    set((s) => {
      const step = s.steps[stepId] ?? emptyStep();
      const prevIds = Object.keys(step.answers);
      const nextIds = Object.keys(next);
      // `stage` is the store's own bookkeeping (markScreenRecorded moves it to
      // "confirmed"), so an answer whose value is unchanged keeps its stage; a
      // changed value is a draft again until its next Next (FR-008).
      const keep = (id: AnswerId): boolean => {
        const prev = step.answers[id];
        return prev !== undefined && sameAnswer(prev, { ...next[id]!, stage: prev.stage });
      };
      if (prevIds.length === nextIds.length && nextIds.every(keep)) return s;
      const answers: Record<AnswerId, SavedAnswer> = {};
      const now = Date.now();
      for (const id of nextIds) {
        answers[id] = keep(id) ? step.answers[id]! : { ...next[id]!, savedAt: now };
      }
      return { steps: { ...s.steps, [stepId]: { ...step, answers } } };
    }),

  setPosition: (stepId, pos) =>
    set((s) => {
      const step = s.steps[stepId] ?? emptyStep();
      if (s.steps[stepId] !== undefined && step.position === pos) return s;
      return { steps: { ...s.steps, [stepId]: { ...step, position: pos } } };
    }),

  setStatus: (stepId, status) =>
    set((s) => {
      const step = s.steps[stepId] ?? emptyStep();
      return { steps: { ...s.steps, [stepId]: { ...step, status } } };
    }),

  markScreenRecorded: (stepId, screenId, hash) =>
    set((s) => {
      const step = s.steps[stepId] ?? emptyStep();
      const answers: Record<AnswerId, SavedAnswer> = {};
      for (const [id, a] of Object.entries(step.answers)) {
        answers[id] = a.screenId === screenId && a.stage === "draft" ? { ...a, stage: "confirmed" } : a;
      }
      return {
        steps: {
          ...s.steps,
          [stepId]: { ...step, answers, lastRecorded: { ...step.lastRecorded, [screenId]: hash } },
        },
      };
    }),

  setRecordedScreen: (entryId, screenId) =>
    set((s) =>
      s.recordedScreenOf[entryId] === screenId
        ? s
        : { recordedScreenOf: { ...s.recordedScreenOf, [entryId]: screenId } },
    ),

  reset: () => set({ steps: {}, recordedScreenOf: {} }),
}));

/** The persisted part of the store (DurableDraft.surveyAnswers). */
export function getSurveyAnswerSnapshot(): SurveyAnswerSnapshot {
  const { steps, recordedScreenOf } = useSurveyAnswerStore.getState();
  return { steps, recordedScreenOf };
}

/**
 * Replace the store's contents with a restored snapshot — a direct `set()`, not
 * `reset()` first (mirrors `applyPhaseBDraftSnapshot`).
 */
export function applySurveyAnswerSnapshot(snapshot: SurveyAnswerSnapshot): void {
  useSurveyAnswerStore.setState({ steps: snapshot.steps, recordedScreenOf: snapshot.recordedScreenOf });
}

/** `stepId`'s saved answers right now, without subscribing. */
export function peekStepAnswers(stepId: StepId): StepAnswers | undefined {
  return useSurveyAnswerStore.getState().steps[stepId];
}

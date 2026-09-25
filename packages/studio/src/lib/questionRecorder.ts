// questionRecorder — how a step records one screen's answers at its Next
// (spec 079 R-04, FR-040).
//
// StepHost provides the recorder bound to the active step; a step (or a
// SurveyRunner nested several adapters deep inside one) reads it with
// `useRecordQuestionAnswers()`. A context rather than an `EditorStepProps` prop
// because the SurveyRunner that owns a flow's Next is rendered by adapters that
// would otherwise all have to thread it through.
//
// The default is a no-op, so a step rendered outside StepHost (a unit test)
// works unchanged. The step's FINAL screen is not recorded through here: it is
// recorded by step completion, so the keyboard effect applied there attaches
// its diff to that screen's entries (plan risk 2).

import { createContext, useContext } from "react";
import type { SurveyAnswer } from "@keyboard-studio/contracts";

/** Record `answers` as given on `screenId` of the step currently hosted. */
export type ScreenRecorder = (screenId: string, answers: readonly SurveyAnswer[]) => void;

const NOOP: ScreenRecorder = () => {};

export const QuestionRecorderContext = createContext<ScreenRecorder>(NOOP);

export function useRecordQuestionAnswers(): ScreenRecorder {
  return useContext(QuestionRecorderContext);
}

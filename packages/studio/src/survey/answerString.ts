// Shared answer-extraction helper for survey phase wrappers.
//
// PhaseA.tsx and IdentityLite.tsx both derive typed results from a completed
// SurveyPhaseResult's untyped SurveyAnswer[] — both needed the same
// "text"/"select" string extraction, so it lives here once.

import type { SurveyPhaseResult } from "@keyboard-studio/contracts";

/**
 * Extract a "text"/"select" answer's string value from a SurveyPhaseResult by
 * questionId. Returns "" when the answer is missing or of a different
 * answerType.
 */
export function answerString(result: SurveyPhaseResult, questionId: string): string {
  const answer = result.answers.find((a) => a.questionId === questionId);
  if (answer === undefined) return "";
  if (answer.answerType === "text" || answer.answerType === "select") {
    return String(answer.value);
  }
  return "";
}

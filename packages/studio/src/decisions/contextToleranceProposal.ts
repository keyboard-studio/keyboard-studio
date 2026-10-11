// The tool's proposal for the context-tolerance decision (spec 078, FR-007).
//
// The marks step records two survey answers: `marks.context_tolerance` (the
// outcome) and, for a partial outcome, `marks.context_tolerance.sites` (the
// accepted rule ids). The tool always proposed accepting every fixable rule,
// and the phase result carries exactly what it offered (`proposedSiteIds`), so
// the proposal is read off the result being recorded rather than off any
// store. Accepting everything therefore records `tool-proposed` / `analysis`;
// a partial or declined outcome records `hand-set` with the offer attached.

import type { SurveyPhaseResult } from "@keyboard-studio/contracts";
import type { ProposalLookup } from "./recordSurveyAnswers.ts";
import {
  CONTEXT_TOLERANCE_QUESTION_ID,
  CONTEXT_TOLERANCE_SITES_QUESTION_ID,
  SITE_ID_SEPARATOR,
} from "./contextToleranceIds.ts";

export {
  CONTEXT_TOLERANCE_QUESTION_ID,
  CONTEXT_TOLERANCE_SITES_QUESTION_ID,
  SITE_ID_SEPARATOR,
} from "./contextToleranceIds.ts";

/**
 * Wrap `fallback` so the two context-tolerance question ids resolve against
 * `result`'s own decision. Returns `fallback` unchanged when the result
 * carries no context-tolerance decision.
 */
export function withContextToleranceProposal(
  result: Pick<SurveyPhaseResult, "marksContextTolerance">,
  fallback: ProposalLookup | undefined,
): ProposalLookup | undefined {
  const decision = result.marksContextTolerance;
  if (decision === undefined) return fallback;
  const siteIds = [...decision.proposedSiteIds];
  const keepOnOverride = { value: "accept", siteIds };
  return (questionId, stepId) => {
    if (questionId === CONTEXT_TOLERANCE_QUESTION_ID) {
      return { value: "accept", source: "analysis", keepOnOverride };
    }
    if (questionId === CONTEXT_TOLERANCE_SITES_QUESTION_ID) {
      return { value: siteIds.join(SITE_ID_SEPARATOR), source: "analysis", keepOnOverride };
    }
    return fallback?.(questionId, stepId);
  };
}

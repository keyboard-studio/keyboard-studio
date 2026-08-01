// recordSurveyAnswers — fan a completed survey step out into one decision entry
// per answer (specs/053-decision-audit FR-001).
//
// One answer, one entry. A step that resolves four questions records four
// decisions, because "what did the author decide?" is asked of a question, not of
// a screen — and because superseding has to work per question when the author
// walks back and changes one of the four.
//
// PROVENANCE, AND AN HONEST LIMITATION
//
// `SurveyAnswer` carries no provenance (deliberately — the locked contract type
// is not extended, research D-03), so agency has to be derived by comparing the
// recorded value against what the tool proposed. That comparison needs a proposal
// to compare against, and today the studio has no session-wide register of
// per-question proposals: the one real source, the langtags seeds in
// `survey/IdentityLite.tsx`, keeps them in a component-local ref
// (`provenanceRef`) that nothing outside that component can read.
//
// So `resolveProposal` is a seam, fully implemented and tested here, and the
// shipped wiring supplies only what is actually reachable. Where no proposal is
// known the entry records `"hand-set"` — which is the truthful floor: absent
// evidence that a value was proposed, what the record can honestly say is that
// this is the value the author confirmed. Lifting the identity step's seeds into
// the session so they flow through this seam is a contained follow-up, and until
// it lands most survey entries will read as `"hand-set"`. That is a stated Phase-1
// limitation, in the same spirit as research D-05's note about the mutate seam —
// not a gap papered over with a guess.

import type {
  DecisionProposalSource,
  DecisionProvenance,
  DecisionPayload,
  SurveyAnswer,
  SurveyPhaseResult,
} from "@keyboard-studio/contracts";
import type { DecisionEntryInput } from "./decisionLogStore.ts";

/** A value the tool proposed for a question, and where the proposal came from. */
export interface AnswerProposal {
  value: string | readonly string[] | boolean;
  source: DecisionProposalSource;
}

/** Looks up the proposal for a question id, or `undefined` when none is known. */
export type ProposalLookup = (questionId: string) => AnswerProposal | undefined;

export interface RecordSurveyAnswersDeps {
  /** The log's append (returns `null` on an identical revisit). */
  append: (input: DecisionEntryInput) => string | null;
  /** Optional proposal register — see the module header. */
  resolveProposal?: ProposalLookup;
}

/** Value equality across the three shapes a survey answer can hold. */
function valuesEqual(
  recorded: SurveyAnswer["value"],
  proposed: AnswerProposal["value"],
): boolean {
  if (Array.isArray(recorded)) {
    if (!Array.isArray(proposed)) return false;
    return recorded.length === proposed.length && recorded.every((v, i) => v === proposed[i]);
  }
  return recorded === proposed;
}

/**
 * Derive the two provenance axes for one recorded answer.
 *
 * - a proposal that MATCHES the recorded value ⇒ the tool's value shipped;
 *   `"base"` as the proposal source means it came from the base keyboard, which
 *   is `"base-derived"` rather than `"tool-proposed"` — the base is not the tool
 *   suggesting something, it is inherited content;
 * - a proposal that DIFFERS ⇒ the author overrode it, so the recorded value is
 *   theirs: `"hand-set"`, with no source. Naming the rejected proposal's source
 *   here would read as if the proposal were what shipped;
 * - no proposal ⇒ `"hand-set"` (see the module header).
 */
export function deriveAnswerProvenance(
  recorded: SurveyAnswer["value"],
  proposal: AnswerProposal | undefined,
): DecisionProvenance {
  if (proposal === undefined) return { agency: "hand-set" };
  if (!valuesEqual(recorded, proposal.value)) return { agency: "hand-set" };
  return proposal.source === "base"
    ? { agency: "base-derived", source: "base" }
    : { agency: "tool-proposed", source: proposal.source };
}

/**
 * Build the payload for one answer.
 *
 * The cast is the one place the survey's answer union meets the record's: both
 * are generated from the same `AnswerType` with the same per-type value
 * discipline (see `SurveyAnswerValueFor` in contracts/decisionRecord.ts), so the
 * shapes are identical — but TypeScript cannot see that through two
 * independently-mapped unions. `DecisionPayloadSchema` re-checks the pairing at
 * runtime on every read, so a drift here surfaces as a dropped entry rather than
 * as a silently wrong record.
 */
function payloadFor(answer: SurveyAnswer): DecisionPayload {
  return {
    kind: "survey-answer",
    questionId: answer.questionId,
    answerType: answer.answerType,
    value: answer.value,
  } as DecisionPayload;
}

/**
 * Record every answer in a completed step.
 *
 * @returns the `entryId` of each answer that produced a new entry, in answer
 *   order. Identical revisits contribute nothing, so the result can be shorter
 *   than `result.answers` — callers use its length to decide whether a step's
 *   captured source change is attributable to a single decision.
 */
export function recordSurveyAnswers(
  stepId: string,
  result: Pick<SurveyPhaseResult, "answers">,
  deps: RecordSurveyAnswersDeps,
): string[] {
  const recorded: string[] = [];
  for (const answer of result.answers) {
    const entryId = deps.append({
      stepId,
      payload: payloadFor(answer),
      provenance: deriveAnswerProvenance(answer.value, deps.resolveProposal?.(answer.questionId)),
    });
    if (entryId !== null) recorded.push(entryId);
  }
  return recorded;
}

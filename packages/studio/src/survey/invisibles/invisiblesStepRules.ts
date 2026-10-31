// invisiblesStepRules -- the invisibles step's candidate list and completion as
// plain functions, so the UI (InvisiblesStep) and a headless caller (spec 107's
// scripted author) take the same path.

import type { SurveyAnswer, SurveyPhaseResult } from "@keyboard-studio/contracts";
import { parseUPlusNotation } from "@keyboard-studio/contracts";
import { isFormatChar } from "../charNormUtils.ts";
import { phaseCConfirmedInventory } from "../phaseCInventory.ts";
import {
  invisibleCandidatesFor,
  invisibleIdSuffix,
  type InvisibleCharacterCandidate,
} from "./invisibleCandidates.ts";

export type InvisibleDecisions = Readonly<Record<string, "accepted" | "declined">>;

/** `"U+200C"` -> `"invisibles.u200c"` -- the recorded answer's questionId. */
export function invisibleQuestionId(candidate: InvisibleCharacterCandidate): string {
  return "invisibles." + invisibleIdSuffix(candidate.codePoint);
}

/**
 * Carry-over (FR-017): what the code-point field left in `controls`, plus the
 * characters already decided about on an earlier visit -- nothing an author
 * entered is dropped.
 */
export function invisiblesCarriedOver(
  controls: readonly string[],
  invisibleDecisions: InvisibleDecisions,
): string[] {
  const fromControls = controls.filter(isFormatChar);
  const fromDecisions = Object.keys(invisibleDecisions)
    .map(parseUPlusNotation)
    .filter((c): c is string => c !== null);
  return [...fromControls, ...fromDecisions];
}

/** The candidates the step offers (the list is direction-invariant). */
export function invisiblesCandidates(
  direction: Parameters<typeof invisibleCandidatesFor>[0]["direction"],
  carriedOver: readonly string[],
): InvisibleCharacterCandidate[] {
  return invisibleCandidatesFor({ direction, carriedOver });
}

/** True when the author accepted this candidate. */
export function isInvisibleAccepted(
  invisibleDecisions: InvisibleDecisions,
  candidate: InvisibleCharacterCandidate,
): boolean {
  return invisibleDecisions[candidate.notation] === "accepted";
}

/**
 * Continue: one boolean per OFFERED candidate (a declined or untouched offer
 * records `false`, distinguishable from never asked), and the shared phase-C
 * confirmed inventory.
 */
export function invisiblesResult(
  candidates: readonly InvisibleCharacterCandidate[],
  invisibleDecisions: InvisibleDecisions,
): SurveyPhaseResult {
  const answers: SurveyAnswer[] = candidates.map((c) => ({
    questionId: invisibleQuestionId(c),
    answerType: "boolean",
    value: isInvisibleAccepted(invisibleDecisions, c),
  }));
  return { phase: "C", answers, confirmedInventory: phaseCConfirmedInventory() };
}

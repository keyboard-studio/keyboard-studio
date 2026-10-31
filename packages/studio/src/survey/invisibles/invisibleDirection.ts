// invisibleDirection — the author's writing direction, read from what they
// already told us. Moved out of InvisiblesStep.tsx so the invisibles
// gallery pane (#1794) can collapse its Direction controls section with
// the same rule the step uses for its bidi group.

import type { SurveyAnswer } from "@keyboard-studio/contracts";
import type { DecisionId, DecisionSet } from "../../decisions/decisionTypes.ts";
import type { SurveyContext } from "../types.ts";

export type WritingDirection = "rtl" | "ltr" | "unknown";

/**
 * The direction-relevant answers, read from the decision records. The
 * questions' modules provide `reserve-writing-direction` (Phase A
 * `writing_direction`), `non-roman-branch` (Phase B `pb_non_roman_branch`)
 * and `rtl-direction-confirm` (Phase B `pb_rtl_direction_confirm`), and
 * `recordAnswersAsDecisions` writes each answer under its provided id at
 * completion. Until spec 090 T063 these answers were read out of the
 * phase results; the phase slot carries no answers now, so the decision
 * set is the source. The list is ordered Phase A before Phase B — the
 * precedence `writingDirectionFrom` relies on (a Phase A direction
 * answer wins outright).
 */
export function directionAnswersFromDecisions(
  decisions: DecisionSet,
): SurveyAnswer[] {
  const out: SurveyAnswer[] = [];
  const push = (id: DecisionId, questionId: string): void => {
    const record = decisions[id];
    if (record === undefined || record.value === undefined || record.value === null) return;
    out.push({
      questionId,
      answerType: "select",
      value: typeof record.value === "string" ? record.value : String(record.value),
    });
  };
  push("reserve-writing-direction", "writing_direction");
  push("non-roman-branch", "pb_non_roman_branch");
  push("rtl-direction-confirm", "pb_rtl_direction_confirm");
  return out;
}

/**
 * The author's writing direction, read from what they already told us — the
 * Phase A `writing_direction` answer, the Phase B right-to-left branch (its
 * `pb_rtl_direction_confirm` question is only ever asked on that branch, so
 * either answer to it means the script is right-to-left), the
 * `pb_non_roman_branch` pick, or the identity prefill's script family.
 * `"unknown"` when none of those has been answered.
 */
export function writingDirectionFrom(
  answers: readonly SurveyAnswer[],
  surveyContext: SurveyContext,
): WritingDirection {
  let rtlBranch = false;
  for (const a of answers) {
    const v = typeof a.value === "string" ? a.value : String(a.value);
    if (a.questionId === "writing_direction") {
      if (v === "rtl") return "rtl";
      if (v === "ltr") return "ltr";
    }
    if (a.questionId === "pb_rtl_direction_confirm") rtlBranch = true;
    if (a.questionId === "pb_non_roman_branch" && v === "rtl") rtlBranch = true;
  }
  if (rtlBranch) return "rtl";
  const family = surveyContext.script_family ?? surveyContext.routing_group;
  if (family === "rtl") return "rtl";
  if (family !== undefined && family !== "") return "ltr";
  return "unknown";
}

// The per-case store reset (contract guarantee 4): every studio store a walk
// touches is reset before and after each case, so cases sharing one vitest
// process (the one-invocation PR lane, research R1) never see each other's
// state. The only store writes the author makes outside a product action;
// boundary.test.ts allow-lists this function by file and name.

import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import { useSurveyAnswerStore } from "../../stores/surveyAnswerStore.ts";
import { useDecisionLogStore } from "../../decisions/decisionLogStore.ts";
import { resetRebuildTrail } from "../../decisions/rebuildWorkingCopy.ts";
import { useTestingStore } from "../../stores/testingStore.ts";

export function resetAuthorStores(): void {
  useWorkingCopyStore.getState().reset();
  useDecisionStore.getState().reset();
  useSurveySessionStore.getState().reset();
  useSurveyAnswerStore.getState().reset();
  useDecisionLogStore.getState().reset();
  // Spec 113: the Trial step driver records a test build in the testing
  // store, so a walk touches it — reset it with the rest, or a second run
  // of the same case would record build 2 and diverge from run 1.
  useTestingStore.getState().reset();
  resetRebuildTrail();
}

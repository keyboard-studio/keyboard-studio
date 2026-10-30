// marksSessionMirror — the session writes MarksStepHost makes from a completed
// series' payload (spec 090 T023): the R10 `migrationNeeded` determination and
// spec 104's guard re-evaluation items. The marks-treatment module's apply has
// no session channel, so the step's host mirrors them. MarksStepHost calls this
// from its effects; the headless scripted author (spec 107) calls it after
// recording the value.
//
// Only-ever-true semantics: nothing here clears the flag (session reset owns
// that), and an empty re-evaluation list writes nothing.

import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import type { MarksCompletion } from "./marksValue.ts";

export function mirrorMarksCompletionToSession(completion: MarksCompletion | null): void {
  if (completion === null) return;
  const session = useSurveySessionStore.getState();
  if (completion.migrationNeeded === true) session.setMarksMigrationNeeded(true);
  if (completion.guardReevaluation.length > 0) session.setMarksGuardReevaluation(completion.guardReevaluation);
}

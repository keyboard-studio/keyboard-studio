// The footer's nav cluster for tests that mount StepHost (via SurveyView)
// without the full StudioShell (spec 081, contract §6). Every step publishes its
// Back / forward buttons under its own step id, and the footer renders the
// active step's entry, keyed on it. This does the same, without the rest of
// the footer.
//
//   render(<><SurveyView baseKeyboard={null} /><ActiveStepNav /></>);

import type { ReactElement } from "react";
import { StepNavCluster } from "../components/StepNavCluster.tsx";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";

export function ActiveStepNav(): ReactElement {
  const activeStepId = useSurveySessionStore((s) => s.activeStepId);
  return <StepNavCluster key={activeStepId} stepId={activeStepId} />;
}

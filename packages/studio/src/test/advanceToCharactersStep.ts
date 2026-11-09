// Shared test helper: drive a mounted SurveyView from "identity" to the
// "characters" step by the shortest path that still shows it. Open hides the
// character survey (spec 111 FR-031), so this takes the Copy path through
// project_name. Assumes the studioShellMocks stand-ins for the steps before it.

import { fireEvent, screen } from "@testing-library/react";

export function advanceToCharactersStep(): void {
  fireEvent.click(screen.getByTestId("survey-advance")); // identity -> layout
  fireEvent.click(screen.getByTestId("layout-continue")); // confirm layout -> base
  fireEvent.click(screen.getByTestId("base-preview")); // preview (separate click)
  fireEvent.click(screen.getByTestId("base-confirm")); // commit -> attribution (copy is the default; no track step)
  fireEvent.click(screen.getByTestId("survey-advance")); // attribution -> project_name (Copy)
  fireEvent.click(screen.getByTestId("survey-advance")); // project_name -> characters (prefill substage)
}

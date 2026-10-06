// Shared test helper: drive a mounted SurveyView from "identity" to the
// "characters" step by the shortest path (track-adapt skips project_name).
// Assumes the studioShellMocks stand-ins for the steps before it.

import { fireEvent, screen } from "@testing-library/react";

export function advanceToCharactersStep(): void {
  fireEvent.click(screen.getByTestId("survey-advance")); // identity -> layout
  fireEvent.click(screen.getByTestId("layout-continue")); // confirm layout -> base
  fireEvent.click(screen.getByTestId("base-preview")); // preview (separate click)
  fireEvent.click(screen.getByTestId("base-confirm")); // commit -> track
  fireEvent.click(screen.getByTestId("track-adapt")); // track -> characters (prefill substage)
}

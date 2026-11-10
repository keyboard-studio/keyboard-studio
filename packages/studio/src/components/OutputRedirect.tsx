// OutputRedirect — the `#output` route is a redirect, not a screen
// (spec 113, #2540).
//
// The Output screen is retired; its panels moved into the Trial and Publish
// steps. The `#output` route token, the nav tab and the `nav.output` label
// are kept (route tokens are stable per spec 057; bookmarks must not 404),
// but the route now sends the author into the tail:
//
// - no project → `#start` (the New-or-Open choice; the old cold-arrival
//   picker is retired with the screen — Start is the entry point for
//   picking a base);
// - walk finished (`activeStepId === "done"`) → the Publish step, where
//   the release lives;
// - otherwise → the Trial step, the tail's start.
//
// The jump uses the store's forward primitive (`advance(target)`), not
// `jumpToLocation`: `resolveLocation` refuses a jump to a step the author
// has not visited, and the whole point of the Output tab is that it is
// reachable mid-walk (tabs are always reachable; the walk's gates govern
// positions inside the walk, not which tab the author may look at). The
// forward primitive pushes the current step onto the Back stack, so Back
// from Trial returns the author to where they were. The effect is guarded
// on `activeStepId !== target`, so StrictMode's double-mount and a second
// click on the Output tab while already standing on the target are no-ops
// (and a same-value hash assignment fires no hashchange).

import { useEffect } from "react";
import { navigateTo } from "../lib/navigate.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";

export function OutputRedirect() {
  useEffect(() => {
    const session = useSurveySessionStore.getState();
    const hasProject = useWorkingCopyStore.getState().startKeyboard !== null;
    if (!hasProject) {
      navigateTo("start");
      return;
    }
    const target = session.activeStepId === "done" ? "publish" : "trial";
    if (session.activeStepId !== target) session.advance(target);
    navigateTo("survey");
  }, []);
  return null;
}

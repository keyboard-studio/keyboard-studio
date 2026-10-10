// useOutputAutosave — keep the durable-draft autosave running while Output is
// open.
//
// The autosave subscription is owned by SurveyView (StudioShell's
// `autosaveTeardownRef`) and torn down when it unmounts. The `#output` route
// renders OutputScreen in its place, so without this nothing changed on
// Output — test builds and tester reports (spec 094), a direct `.kmn` edit —
// reached storage until the author happened to revisit a survey step, and a
// reload in between lost it.
//
// This installs the same subscription for the life of the Output screen,
// under the key SurveyView's own restore branch derives
// (`deriveProjectKeyFromWorkingCopy`). It rides the same 500 ms timer, the
// same pagehide flush and the same orphan guard as SurveyView's install: no
// new timer, and D3 is not involved (it saves; it never validates). Nothing is
// installed while no working copy is instantiated.

import { useEffect } from "react";
import { deriveProjectKeyFromWorkingCopy, installDraftAutosave } from "../lib/draftPersistence.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";

export function useOutputAutosave(): void {
  useEffect(() => {
    const projectKey = deriveProjectKeyFromWorkingCopy(useWorkingCopyStore.getState());
    if (projectKey === null) return;
    return installDraftAutosave(projectKey);
  }, []);
}

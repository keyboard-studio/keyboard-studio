// Welcome.htm step: drive the Documentation editor (specs/html-editor) —
// seed from the authored text, else the base's start prose, else a stub
// paragraph (the walk carries no rendered preview outside React), append
// one edited paragraph, and record the completion the way HtmlEditor does
// on Continue.

import { completeHtmlStep } from "../../../lib/htmlStepCompletion.ts";
import { useWorkingCopyStore } from "../../../stores/workingCopyStore.ts";
import type { StepDrivers } from "./types.ts";

export const welcomeHtmDrivers: StepDrivers = {
  html: () => {
    const state = useWorkingCopyStore.getState();
    const seed = state.authoredWelcomeHtm ?? state.startWelcomeHtmText ?? "<p>Documentation.</p>";
    const edited = `${seed}\n<p>Edited in the Documentation step.</p>`;
    completeHtmlStep({ welcomeHtm: edited });
    return { welcomeHtm: edited };
  },
};

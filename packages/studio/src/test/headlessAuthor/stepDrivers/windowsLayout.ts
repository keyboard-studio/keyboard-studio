// Windows layout: proposeWindowsLayout.
//
// The layout step's Continue (LayoutStepHost): the studio proposes a Windows
// layout from the identity language tag, preselected; Continue on the untouched
// suggestion records it as confirmed. The case names no layout, so the walk
// policy takes the top suggestion and the step completes through
// confirmWindowsLayout, the function the component's Continue calls.

import { getDecisionSnapshot } from "../../../stores/decisionStore.ts";
import { deriveSurveyContext } from "../../../decisions/identitySelectors.ts";
import { proposeWindowsLayout } from "../../../lib/windowsLayouts.ts";
import { buildGalleryHostDeps } from "../../../lib/galleryHostDeps.ts";
import { confirmWindowsLayout } from "../../../survey/layout/confirmWindowsLayout.ts";
import { chooseByPolicy } from "../walkPolicy.ts";
import type { StepDrivers } from "./types.ts";

export const windowsLayoutDrivers: StepDrivers = {
  layout: (ctx) => {
    const decisions = getDecisionSnapshot();
    const proposal = proposeWindowsLayout(deriveSurveyContext(decisions).bcp47_tag);
    const step = chooseByPolicy<string>({
      decisionId: "windows-layout",
      suggestions: [proposal.layout.id],
      proposalSource: "proposeWindowsLayout",
    });
    ctx.report.addStep(step);
    confirmWindowsLayout(decisions["windows-layout"], step.value, buildGalleryHostDeps());
    // LayoutStepHost completes with no result.
    return undefined;
  },
};

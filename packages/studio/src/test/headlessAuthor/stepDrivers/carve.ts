// Carve: the product's recommendation, then Continue with the pre-marked
// suggestion left as offered.
//
// The recommendation is survey/carve/carveRecommendation.ts over the settled
// needed set (lib/carveNeededSet.ts); Continue is carveContinue.ts's
// applyCarveSuggestion, and the step records the decision the same way
// CarveAdapter's onComplete does.

import { resolveCarveNeededSet } from "../../../lib/carveNeededSet.ts";
import { useWorkingCopyStore } from "../../../stores/workingCopyStore.ts";
import { applyCarveSuggestion, recordCarveDecision } from "../../../survey/carve/carveContinue.ts";
import { carveRecommendation } from "../../../survey/carve/carveRecommendation.ts";
import { chooseByPolicy } from "../walkPolicy.ts";
import type { StepDrivers } from "./types.ts";

export const carveDrivers: StepDrivers = {
  carve: async (ctx) => {
    const wc = useWorkingCopyStore.getState();
    const needed = await resolveCarveNeededSet(wc);
    const { recommendationReady, primaryRows } = carveRecommendation({
      ir: wc.ir,
      instantiationMode: wc.instantiationMode,
      retainedConvenienceChars: wc.session.retainedConvenienceChars,
      needed,
    });
    const chars = primaryRows.map((r) => r.ch);
    ctx.report.addStep(
      chooseByPolicy({
        decisionId: "carved-layout",
        suggestions: chars.length > 0 ? [chars] : [],
        defaultValue: chars,
        proposalSource: "carveRecommendation",
      }),
    );
    applyCarveSuggestion(primaryRows, recommendationReady);
    recordCarveDecision();
    return undefined;
  },
};

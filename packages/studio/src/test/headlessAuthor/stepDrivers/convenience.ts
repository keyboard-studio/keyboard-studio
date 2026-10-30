// Convenience characters: the product's gate over the carve needed set, then
// the default retained set accepted the way the component's Continue does.
//
// The gate's inputs come from lib/carveNeededSet.ts (the hook's composition,
// settled) and survey/convenience/convenienceContinue.ts (the gate, value and
// completion the component calls). A gate that does not apply completes the
// step as the component's auto-skip does; otherwise the offered candidates are
// all pre-checked, and Continue records that value and completes.

import { resolveCarveNeededSet } from "../../../lib/carveNeededSet.ts";
import { buildGalleryHostDeps } from "../../../lib/galleryHostDeps.ts";
import { makeGalleryOnChange } from "../../../steps/galleryHost.tsx";
import { getDecisionSnapshot } from "../../../stores/decisionStore.ts";
import { useWorkingCopyStore } from "../../../stores/workingCopyStore.ts";
import retainedConvenienceCharsModule from "../../../survey/questions/gallery/retainedConvenienceChars.ts";
import {
  continueConvenience,
  convenienceGateFor,
  gateCandidates,
  recordConvenienceStatus,
  skipConvenience,
} from "../../../survey/convenience/convenienceContinue.ts";
import type { RetainedConvenienceCharsValue } from "../../../survey/convenience/convenienceValue.ts";
import { chooseByPolicy } from "../walkPolicy.ts";
import type { StepDrivers } from "./types.ts";

const DECISION_ID = "retained-convenience-chars";
const STEP_ID = "convenience";

export const convenienceDrivers: StepDrivers = {
  [STEP_ID]: async (ctx) => {
    const wc = useWorkingCopyStore.getState();
    const needed = await resolveCarveNeededSet(wc);
    const gate = convenienceGateFor({ ir: wc.ir, instantiationMode: wc.instantiationMode, needed });

    if (gate.kind === "not-applicable") {
      const skip = skipConvenience(gate, needed.hasSignal);
      recordConvenienceStatus(skip.status);
      ctx.report.addSkippedStep({ step: STEP_ID, reason: gate.reason.code });
      return skip.result;
    }

    const value = getDecisionSnapshot()[DECISION_ID]?.value as
      | RetainedConvenienceCharsValue
      | undefined;
    const done = continueConvenience(gateCandidates(gate), value);
    ctx.report.addStep(
      chooseByPolicy({
        decisionId: DECISION_ID,
        suggestions: [],
        defaultValue: done.result.retainedConvenienceChars ?? [],
        proposalSource: "convenienceGateFor",
      }),
    );
    if (done.record !== null) {
      makeGalleryOnChange({
        module: retainedConvenienceCharsModule,
        stepId: STEP_ID,
        deps: buildGalleryHostDeps(),
      })(done.record);
    }
    recordConvenienceStatus(done.status);
    return done.result;
  },
};

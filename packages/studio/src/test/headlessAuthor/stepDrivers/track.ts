// Starting keyboard and track: the case names both; proposeTrack is recorded for comparison.
//
// choose_base: the case names the copied keyboard, so the walk policy's choice is
// that override, applied through the functions "Choose this keyboard" runs: the
// preview write (setLocalStart), then confirmStartKeyboard (the rebase gate,
// the `base-keyboard` decision through the gallery host's onChange, and the
// step result). The loop has already instantiated the working copy from the same
// keyboard before the first step, as spec 106's replay does, so no second
// instantiation happens here: the product itself no-ops a re-instantiation of
// the same base (workingCopyStore's resolveInstantiationCase), and the rebase
// confirm is not asked for the same id.
//
// track: the track flow (`trackOptions`) walks with the case's track as the
// override. proposeTrack is the flow's own seed (options.seeds.getSeedValue), so
// the proposal the run reports and the record's `analysis` source come from the
// product; a case track equal to the proposal is recorded as the kept proposal,
// a different one as overturned, by the product's own answer origin.

import { useSurveySessionStore } from "../../../stores/surveySessionStore.ts";
import { useWorkingCopyStore } from "../../../stores/workingCopyStore.ts";
import { runLiveExtractionFromStores } from "../../../decisions/liveExtraction.ts";
import { makeGalleryOnChange } from "../../../steps/galleryHost.tsx";
import { buildGalleryHostDeps } from "../../../lib/galleryHostDeps.ts";
import startKeyboardModule from "../../../survey/questions/gallery/baseKeyboard.ts";
import { confirmStartKeyboard } from "../../../survey/chooseStart/confirmStartKeyboard.ts";
import { trackOptions } from "../../../editors/adapters/flowStepOptionRecords.ts";
import { chooseByPolicy } from "../walkPolicy.ts";
import { completeFlowStep } from "./flowStep.ts";
import type { DriverContext, StepDrivers } from "./types.ts";

/**
 * What StudioShell's instantiation effect runs once the base and the track are
 * both recorded, after it instantiates: the base-contribution baseline, then the
 * live extraction pass. The loop instantiates before the first step, so the
 * effect's instantiation is already done; this is the rest of it. Called at the
 * start of the first step after the track completes.
 */
export function commitStartKeyboard(ctx: Pick<DriverContext, "recorder">): void {
  ctx.recorder?.recordStartContributionNow();
  runLiveExtractionFromStores();
}

export const trackDrivers: StepDrivers = {
  choose_base: (ctx) => {
    const start = useWorkingCopyStore.getState().startKeyboard;
    if (start === null || start.id !== ctx.case.base) {
      throw new Error(`choose_base: the working copy holds "${start?.id ?? "nothing"}", the case names "${ctx.case.base}"`);
    }
    const step = chooseByPolicy({
      decisionId: "base-keyboard",
      override: { id: ctx.case.base, name: start.displayName },
      suggestions: [],
    });
    ctx.report.addStep(step);

    // The preview click, then "Choose this keyboard".
    useSurveySessionStore.getState().setLocalStart(start);
    const onChange = makeGalleryOnChange({
      module: startKeyboardModule,
      stepId: "choose_base",
      deps: buildGalleryHostDeps(),
    });
    const result = confirmStartKeyboard(start, onChange);
    if (result === null) throw new Error("choose_base: the rebase confirm was declined");
    return result;
  },

  track: (ctx) =>
    completeFlowStep(trackOptions, { overrides: { track_choice: ctx.case.track } }, ctx),
};

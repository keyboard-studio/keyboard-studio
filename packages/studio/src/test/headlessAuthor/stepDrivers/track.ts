// Starting keyboard and track: the case names both; proposeTrack is recorded for comparison.
//
// choose_base: the case names the copied keyboard, so the walk policy's choice is
// that override, applied through the functions "Choose this keyboard" runs: the
// preview write (setLocalStart), then confirmStartKeyboard (the rebase gate,
// the `base-keyboard` decision through the gallery host's onChange, and the
// step result). The previewed keyboard is the start-keyboard browser's own
// catalog record (name from the .kmn header, languages from the .kps), built by
// the function the catalog scan calls (readCatalogEntry).
//
// Nothing is instantiated here, as in the UI: StudioShell instantiates once the
// `base-keyboard` and `authoring-track` decisions are both recorded
// (commitStartKeyboard below), so identity and choose_base run with no start
// keyboard, and live extraction sees the starting point only after the track.
//
// track: the track flow (`trackOptions`) walks with the case's track as the
// override. proposeTrack is the flow's own seed (options.seeds.getSeedValue), so
// the proposal the run reports and the record's `analysis` source come from the
// product; a case track equal to the proposal is recorded as the kept proposal,
// a different one as overturned, by the product's own answer origin.

import { dirname } from "node:path";
import type { StartKeyboard } from "@keyboard-studio/contracts";
import { useSurveySessionStore } from "../../../stores/surveySessionStore.ts";
import { getDecisionSnapshot, selectTrack } from "../../../stores/decisionStore.ts";
import { runLiveExtractionFromStores } from "../../../decisions/liveExtraction.ts";
import { makeGalleryOnChange } from "../../../steps/galleryHost.tsx";
import { buildGalleryHostDeps } from "../../../lib/galleryHostDeps.ts";
import { applyStepCompletion, type ReducerDeps } from "../../../steps/reducer.ts";
import type { DecisionRecorder } from "../../../decisions/createDecisionRecorder.ts";
import startKeyboardModule from "../../../survey/questions/gallery/baseKeyboard.ts";
import { confirmStartKeyboard } from "../../../survey/chooseStart/confirmStartKeyboard.ts";
import { trackOptions } from "../../../editors/adapters/flowStepOptionRecords.ts";
import { readCatalogEntry } from "../../../../vite-plugins/keyboardCatalog.ts";
import type { StartingPoint } from "../../decisionPointFixture.ts";
import { CORPUS } from "../../sc004Harness.ts";
import { chooseByPolicy } from "../walkPolicy.ts";
import { completeFlowStep } from "./flowStep.ts";
import type { StepDrivers } from "./types.ts";

/** The catalog record the start-keyboard browser lists for a corpus keyboard. */
export function catalogStartKeyboard(base: string, group: string): StartKeyboard {
  const entry = readCatalogEntry(dirname(CORPUS), "release", group, base);
  if (entry === null) throw new Error(`no catalog entry for release/${group}/${base}`);
  return entry;
}

/**
 * StudioShell's instantiation effect and its doCommit: once the `base-keyboard`
 * and `authoring-track` decisions are both recorded, dispatch the choose_base
 * completion with the previewed keyboard, its loaded source and the track
 * (applyStepCompletion), then record the base-contribution baseline and run the
 * live extraction pass. The loop calls it after each completion until it
 * returns true (doCommit fires once per base).
 */
export function commitStartKeyboard(input: {
  point: StartingPoint;
  reducerDeps: ReducerDeps;
  recorder: DecisionRecorder;
}): boolean {
  const decisions = getDecisionSnapshot();
  const track = selectTrack(decisions);
  if (decisions["base-keyboard"] === undefined || track === null) return false;
  const previewed = useSurveySessionStore.getState().localStart;
  if (previewed === null || previewed.id !== input.point.base.id) return false;
  applyStepCompletion(
    "choose_base",
    {
      base: previewed,
      vfs: input.point.vfs,
      ir: input.point.ir,
      removalCapabilities: input.point.removalCapabilities,
      track,
      skipRebaseConfirm: true,
    },
    input.reducerDeps,
  );
  input.recorder.recordStartContributionNow();
  runLiveExtractionFromStores();
  return true;
}

export const trackDrivers: StepDrivers = {
  choose_base: (ctx) => {
    const start = catalogStartKeyboard(ctx.case.base, ctx.case.group);
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

// Touch seed source and touch: the seed-source step's default over the product's
// seed derivation, then the touch step completed with no key edits.
//
// touch_seed_source: the chooser starts on the recorded choice, else Import &
// adapt when the copied keyboard ships a usable touch layout, else Reseed
// (touchSeedSourceContinue.ts defaultTouchSeedSource). The panel derives the
// seed that card previews with deriveSeedLayout (deriveSeedPreview) before
// Confirm; the driver derives it too, so a seed the product cannot derive stops
// the case here rather than at the output. Confirm is the same two calls the
// panel makes: clear the touch draft when the pick changes, record the decision
// through the gallery host's onChange. The step passes no result.
//
// touch: AddTouchAdapter's completion with the assignments TouchGallery would
// pass for an author who edits nothing (an empty list): the step's decision is
// recorded and the R11-gated layout build runs (completeTouchStep). A keyboard
// with no touch layout and an import-adapt pick emits nothing, as in the UI.

import { buildGalleryHostDeps } from "../../../lib/galleryHostDeps.ts";
import { resolveStartTouchJson } from "../../../lib/resolveStartTouchJson.ts";
import { completeTouchStep, touchDesktopModifications } from "../../../lib/touchStepCompletion.ts";
import { makeGalleryOnChange } from "../../../steps/galleryHost.tsx";
import { getDecisionSnapshot, selectTouchSeedSource } from "../../../stores/decisionStore.ts";
import { useWorkingCopyStore } from "../../../stores/workingCopyStore.ts";
import touchSeedSourceModule from "../../../survey/questions/gallery/touchSeedSource.ts";
import {
  clearTouchDraftOnSeedChange,
  defaultTouchSeedSource,
  deriveSeedPreview,
  startShipsUsableTouch,
} from "../../../survey/touchSeedSource/touchSeedSourceContinue.ts";
import { StepFailure } from "../stepFailure.ts";
import { chooseByPolicy } from "../walkPolicy.ts";
import type { StepDrivers } from "./types.ts";

const DECISION_ID = "touch-seed-source";
const STEP_ID = "touch_seed_source";

/** Re-exported for the case runner, which keys G6 applicability on the same read. */
export { startShipsUsableTouch };

/** The mods the panel and the adapter both read from the working copy. */
function currentMods(wc: ReturnType<typeof useWorkingCopyStore.getState>) {
  return touchDesktopModifications(
    wc.startIr,
    wc.deletedNodeIds,
    wc.deletedItemIds,
    wc.phaseResults,
    wc.carveChars,
  );
}

export const touchSeedDrivers: StepDrivers = {
  [STEP_ID]: (ctx) => {
    const wc = useWorkingCopyStore.getState();
    const stored = selectTouchSeedSource(getDecisionSnapshot());
    const selected = defaultTouchSeedSource(wc.startVfs, stored);
    const step = chooseByPolicy({
      decisionId: DECISION_ID,
      suggestions: [],
      defaultValue: selected,
      proposalSource: "defaultTouchSeedSource",
    });
    ctx.report.addStep(step);

    const preview =
      wc.startIr === null
        ? null
        : deriveSeedPreview(wc.startIr, resolveStartTouchJson(wc.startVfs), step.value, currentMods(wc));
    if (preview === null) {
      throw new StepFailure({
        step: STEP_ID,
        decisionId: DECISION_ID,
        kind: "proposal-threw",
        detail: `deriveSeedLayout produced no seed for "${step.value}"`,
      });
    }

    clearTouchDraftOnSeedChange(step.value, stored);
    makeGalleryOnChange({
      module: touchSeedSourceModule,
      stepId: STEP_ID,
      deps: buildGalleryHostDeps(),
    })(step.value);
    return undefined;
  },

  touch: () => {
    const wc = useWorkingCopyStore.getState();
    return completeTouchStep({
      assignments: [],
      startIr: wc.startIr,
      startVfs: wc.startVfs,
      mods: currentMods(wc),
      seedSource: selectTouchSeedSource(getDecisionSnapshot()),
    });
  },
};

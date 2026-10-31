// touchStepCompletion -- what the touch step reads and does when the author
// finishes it: the desktop work the seed replays (spec 035 R3), and the
// completion (record `touch-layout`, then fire the completion effects).
//
// Lifted out of AddTouchAdapter and TouchSeedSourcePanel so a headless caller
// derives the same mods and completes through the same code the adapter's
// handler runs. The components call these; they hold no second copy.

import type { KeyboardIR, SurveyPhaseResult } from "@keyboard-studio/contracts";
import type { DesktopModifications } from "@keyboard-studio/engine";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { currentTouchLayoutValue } from "../survey/assignLoop/touchLayoutValue.ts";
import { applyTouchCompletionEffects, type TouchCompleteResult } from "./assignLoopCompletion.ts";
import { deriveDesktopModifications } from "./deriveDesktopModifications.ts";

/** No desktop work to replay when there is no startIr yet. */
const EMPTY_MODS: DesktopModifications = { removals: [], placements: [] };

/** The carve removals and Phase C letter placements the touch seed replays. */
export function touchDesktopModifications(
  startIr: KeyboardIR | null,
  deletedNodeIds: ReadonlySet<string>,
  deletedItemIds: ReadonlySet<string>,
  phaseResults: readonly SurveyPhaseResult[],
  carveChars: ReadonlySet<string>,
): DesktopModifications {
  if (startIr === null) return EMPTY_MODS;
  return deriveDesktopModifications(startIr, deletedNodeIds, deletedItemIds, phaseResults, carveChars);
}

/**
 * The touch step's completion: record `touch-layout` (the key-edit overlay
 * snapshot), fire the completion effects (the R11-gated layout build), and
 * return the payload the step hands to onComplete.
 */
export function completeTouchStep(payload: TouchCompleteResult): TouchCompleteResult {
  useDecisionStore.getState().record({
    id: "touch-layout",
    value: currentTouchLayoutValue(),
    provenance: "asked",
  });
  applyTouchCompletionEffects(payload);
  return payload;
}

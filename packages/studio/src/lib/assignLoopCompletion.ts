// assignLoopCompletion — the assign-loop steps' completion effects
// (spec 090 T041/T042, execution shape D-090-38).
//
// Until US4, these effects lived in steps/reducer.ts as the R1 (lock
// gate) and R2 (touch-layout build) completion hooks. They are not
// decision `apply` work — 089's WorkingCopyPatch has no channel for
// the `desktopLocked` flag, the serialized touch-layout JSON, or the
// staleness-driven re-propagation — so when the mechanisms/touch
// steps became decision modules, the effects re-homed here: plain
// store-driven functions in the lib layer, fired by each step's
// completion wiring. The decision RECORDING is not here — the
// adapters record their step's decision on completion (the
// editor-step precedent: CarveAdapter, DeadkeyAdapter); these
// functions carry only the non-decision effects, so both completion
// paths can share them:
//
//   - the live path: AddPhysicalAdapter / AddTouchAdapter call them
//     from their onComplete wrappers, after recording;
//   - the replay path: survey/journey-runner.ts calls them in place
//     of its former applyStepCompletion("mechanisms" / "touch", …)
//     calls, which reached the same effects through the reducer.

import { repropagate } from "../steps/repropagate.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";

/**
 * R1 — the mechanisms (physical-layout) completion effects, in the
 * reducer hook's exact order: lock the desktop layout, then run the
 * spec-014 touch re-propagation over the staleness closure
 * (no-clobber: suggested touch keys refresh, hand-set keys survive;
 * an empty closure is a no-op, R5). The reducer gated the
 * re-propagation on its injected deps being present; the store
 * accessors here always exist, and repropagate itself owns the
 * empty-closure short-circuit, so the behaviour is unchanged.
 */
export function applyPhysicalCompletionEffects(): void {
  useWorkingCopyStore.getState().lockDesktop();
  repropagate({
    staleSteps: useWorkingCopyStore.getState().staleSteps,
    getWorkingIR: () => useWorkingCopyStore.getState().ir,
    setWorkingIR: (next) => useWorkingCopyStore.getState().setWorkingIR(next),
  });
}

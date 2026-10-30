// Starting keyboard and track: the case names both; proposeTrack is recorded for comparison.
//
// Stub (spec 107 T016): completes the step with its own state untouched, the
// result a component passes when Continue is pressed with nothing changed.

import type { StepDrivers } from "./types.ts";

export const trackDrivers: StepDrivers = {
  choose_base: () => undefined,
  track: () => undefined,
};

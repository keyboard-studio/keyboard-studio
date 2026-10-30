// Touch seed source and touch: deriveSeedLayout and the seed-source step default.
//
// Stub (spec 107 T016): completes the step with its own state untouched, the
// result a component passes when Continue is pressed with nothing changed.

import type { StepDrivers } from "./types.ts";

export const touchSeedDrivers: StepDrivers = {
  touch_seed_source: () => undefined,
  touch: () => undefined,
};

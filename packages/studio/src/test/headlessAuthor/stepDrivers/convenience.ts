// Convenience characters: computeConvenienceGate over deriveCarveNeededSet.
//
// Stub (spec 107 T016): completes the step with its own state untouched, the
// result a component passes when Continue is pressed with nothing changed.

import type { StepDrivers } from "./types.ts";

export const convenienceDrivers: StepDrivers = {
  convenience: () => undefined,
};

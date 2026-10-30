// Deadkeys, rules and mechanism placement: buildPlacementSeeds, getRankedSuggestionsForChar, the lifted chip order.
//
// Stub (spec 107 T016): completes the step with its own state untouched, the
// result a component passes when Continue is pressed with nothing changed.

import type { StepDrivers } from "./types.ts";

export const mechanismDrivers: StepDrivers = {
  deadkeys: () => undefined,
  rules: () => undefined,
  mechanisms: () => undefined,
};

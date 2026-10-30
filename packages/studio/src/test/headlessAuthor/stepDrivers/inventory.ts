// Character inventory: suggestMissingChars over pinned exemplars, derivePlacementInventory.
//
// Stub (spec 107 T016): completes the step with its own state untouched, the
// result a component passes when Continue is pressed with nothing changed.

import type { StepDrivers } from "./types.ts";

export const inventoryDrivers: StepDrivers = {
  characters: () => undefined,
  punctuation: () => undefined,
  invisibles: () => undefined,
};

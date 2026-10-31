// A step's named failure (data-model.md `failure`). Thrown by the routing loop
// and by a driver that must stop the case with a specific kind (for example
// `placeholder-clash`); any other throw from a driver is `proposal-threw`.

import type { RunFailure } from "./caseTypes.ts";

export class StepFailure extends Error {
  constructor(readonly failure: RunFailure) {
    super(failure.detail);
  }
}

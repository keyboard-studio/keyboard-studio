// Test-only stand-in for the choose_base gallery module's base-keyboard
// decision in subset decision flows (runDecisionFlow over a hand-picked
// module list). Subset flows that include the authoring-track provider
// (survey/questions/authoringTrackProvider.ts) need a base-keyboard
// provider too, because that provider requires "base-keyboard" —
// orderDecisions throws on a requires edge with no provider in the list.
// The real provider is the choose_base gallery module, which subset flows
// cannot import (its renderer closes an import cycle through the stores).
// This stub carries no answers: the flow records base-keyboard as a
// default (value undefined), which is all the sort needs.

import type { QuestionModule } from "../survey/types.ts";

export const baseKeyboardProviderModule: QuestionModule = {
  definition: {
    id: "base-keyboard",
    type: "notice",
    prompt: "Base keyboard (provided by the base picker in production)",
    next: null,
  },
  provides: ["base-keyboard"],
  inputs: [],
  writes: [],
  fixtures: {
    valid: [{ value: "basic_kbdfr", note: "corpus base" }],
    invalid: [],
  },
};

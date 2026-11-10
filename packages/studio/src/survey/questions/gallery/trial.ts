// trial — gallery decision module for `trial` (Trial step, spec 113).
//
// The Trial step (#2540) takes over the test-build, tester-report and
// revise-and-return parts of spec 094 that used to sit inside the Output
// screen. Recording is step-side: TrialStep records via onComplete on
// Continue (editor-step precedent). `apply` is a no-op — the test builds and
// reports live in the testingStore slice of the draft envelope (spec 094),
// never via IR paths; the decision record only carries how many test builds
// existed when the author completed the step, for the audit trail.
//
// Boundary (FR-003): a gallery module is a pure descriptor — no store imports.

import type { GalleryModule } from "../../types.ts";

export const definition = {
  id: "trial",
  type: "notice" as const,
  prompt: "Have you tried the keyboard with testers?",
  audit_label: "Trial",
};

/** How many numbered test builds existed when the author completed Trial. */
export interface TrialValue {
  buildsAtCompletion: number;
}

const trial: GalleryModule<TrialValue> = {
  definition,
  provides: ["trial"],
  screen: "trial",
  requires: ["icon"],
  inputs: [],
  writes: [],
  apply: () => ({}),
  renderer: () => null,
  fixtures: {
    valid: [{ value: undefined, note: "no decision recorded yet" }],
    invalid: [],
  },
};

export default trial;

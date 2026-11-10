// publish — gallery decision module for `publish` (Publish step, spec 113).
//
// The Publish step (#2540) takes over the release checks, final downloads
// (.kmp / source .zip / LDML) and the managed GitHub PR that used to sit
// inside the Output screen. Recording is step-side: PublishStep records via
// onComplete on Finish (editor-step precedent). `apply` is a no-op — the
// submission state lives in the testingStore slice (`frozen` once the
// project is submitted, spec 094), never via IR paths; the decision record
// only carries whether the project was submitted when the author finished
// the step, for the audit trail.
//
// Boundary (FR-003): a gallery module is a pure descriptor — no store imports.

import type { GalleryModule } from "../../types.ts";

export const definition = {
  id: "publish",
  type: "notice" as const,
  prompt: "How is the finished keyboard released?",
  audit_label: "Publish",
};

/** Whether the project was submitted (testingStore `frozen`) at completion. */
export interface PublishValue {
  submitted: boolean;
}

const publish: GalleryModule<PublishValue> = {
  definition,
  provides: ["publish"],
  screen: "publish",
  requires: ["trial"],
  inputs: [],
  writes: [],
  apply: () => ({}),
  renderer: () => null,
  fixtures: {
    valid: [{ value: undefined, note: "no decision recorded yet" }],
    invalid: [],
  },
};

export default publish;

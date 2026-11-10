// Publish step driver (spec 113): mirrors the Publish step's Finish path
// for the author who does NOT submit a managed PR.
//
// The headless author finishes without submitting: a managed PR is a real
// network submission to the author's GitHub account, which the headless
// walk never performs (same posture as the icon driver's DOM-free pieces —
// the driver stands in for the component, not for the author's account).
// The step's `onComplete` payload is `{ submitted: frozen }`, and the
// testing store is unfrozen in a headless walk, so Finish reports
// `submitted: false` — the "just download it" author, whose release lives
// in the downloads the step offers, not in a PR.
//
// The downloads themselves (.kmp / source .zip / LDML) are separate buttons
// on the step, not the Finish path, and the trial driver already exercises
// the shared projection/compile/package pipeline through a test build —
// so there is nothing further for this driver to build.

import type { StepDrivers } from "./types.ts";

export const publishDrivers: StepDrivers = {
  publish: () => ({ submitted: false }),
};

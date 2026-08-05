// startOverStore — bridges the survey's "start over" action up to the NavBar.
//
// The reset control lives in the NavBar's right group (top-right corner) so it
// can never overlap the step content's own Back/Next buttons, but the handler
// it fires (SurveyView's handleStartOver) is built from SurveyView-local refs
// — the autosave teardown, the per-base instantiation guard, the snapshotter,
// the resume-banner setters. Lifting all of that into StudioShell would drag
// the compile pipeline's bookkeeping into the shell; publishing the finished
// handler into a store instead keeps it where it belongs.
//
// Same store-bridge pattern as basePreviewStatusStore: one writer (SurveyView,
// on mount/unmount), one reader (NavBar). Because SurveyView only mounts on
// the #survey route, `handler === null` is exactly "not on the survey", which
// is what gates the control's visibility — no second route check needed.

import { create } from "zustand";

interface StartOverState {
  /** Null whenever no survey is mounted. */
  handler: (() => void) | null;
  setHandler: (handler: (() => void) | null) => void;
}

export const useStartOverStore = create<StartOverState>((set) => ({
  handler: null,
  // Wrapped in an object literal rather than passed to set() directly: a bare
  // function argument would be read as zustand's updater form.
  setHandler: (handler) => set({ handler }),
}));

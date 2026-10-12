// startPreviewStatusStore — coarse compile-pipeline status for the base
// keyboard currently previewed in the "Choose a starting keyboard" step.
//
// Written by StudioShell/SurveyView (a pure projection of
// useKeyboardArtifact's `Stage` — Article IV, one debounce/compile cycle, no
// second call site). Read by StartResolutionAdapter so the "Choose this
// keyboard" commit button can reflect the live preview state without
// importing useKeyboardArtifact or the compile pipeline directly.

import { create } from "zustand";

export type StartPreviewStatus = "idle" | "loading" | "ready" | "error";

interface StartPreviewStatusState {
  status: StartPreviewStatus;
  setStatus: (status: StartPreviewStatus) => void;
}

export const useStartPreviewStatusStore = create<StartPreviewStatusState>((set) => ({
  status: "idle",
  setStatus: (status) => set({ status }),
}));

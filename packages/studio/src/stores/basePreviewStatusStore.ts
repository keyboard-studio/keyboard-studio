// basePreviewStatusStore — coarse compile-pipeline status for the base
// keyboard currently previewed in the "Choose a starting keyboard" step.
//
// Written by StudioShell/SurveyView (a pure projection of
// useKeyboardArtifact's `Stage` — Article IV, one debounce/compile cycle, no
// second call site). Read by BaseResolutionAdapter so the "Choose this
// keyboard" commit button can reflect the live preview state without
// importing useKeyboardArtifact or the compile pipeline directly.

import { create } from "zustand";

export type BasePreviewStatus = "idle" | "loading" | "ready" | "error";

interface BasePreviewStatusState {
  status: BasePreviewStatus;
  setStatus: (status: BasePreviewStatus) => void;
}

export const useBasePreviewStatusStore = create<BasePreviewStatusState>((set) => ({
  status: "idle",
  setStatus: (status) => set({ status }),
}));

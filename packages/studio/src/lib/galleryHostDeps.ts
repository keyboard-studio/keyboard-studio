// galleryHostDeps — the live GalleryHostDeps, composed from the stores
// (spec 090 T005).
//
// steps/galleryHost.tsx may not import stores/ (depcruise steps-layer), so
// the composition lives here, in lib/, where store imports are allowed —
// the same reason StudioShell composes the reducer's deps. The patch sink
// below is the SAME function StudioShell injects as the reducer's
// `applyWorkingCopyPatch` (`applyPatchToWorkingCopy`, 089 contract A4, with the
// Open routing of spec 111), so a decision's effect lands identically whether
// a question runner or the gallery host ran it.

import { getDecisionSnapshot, useDecisionStore } from "../stores/decisionStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { journalDecisionWrite } from "./decisionJournal.ts";
import { applyPatchToWorkingCopy, irForApply } from "./applyPatchToWorkingCopy.ts";
import type { GalleryHostDeps } from "../steps/galleryHost.tsx";

/** Compose the live gallery-host deps from the decision + working-copy stores. */
export function buildGalleryHostDeps(): GalleryHostDeps {
  return {
    recordDecision: (record) => {
      journalDecisionWrite([record.id]);
      useDecisionStore.getState().record(record);
    },
    getDecisions: () => getDecisionSnapshot(),
    getWorkingIR: irForApply,
    getHistoryEntryState: () => useWorkingCopyStore.getState().historyEntryState,
    getDocFixProposals: () => useWorkingCopyStore.getState().docFixProposals,
    applyWorkingCopyPatch: applyPatchToWorkingCopy,
  };
}

// galleryHostDeps — the live GalleryHostDeps, composed from the stores
// (spec 090 T005).
//
// steps/galleryHost.tsx may not import stores/ (depcruise steps-layer), so
// the composition lives here, in lib/, where store imports are allowed —
// the same reason StudioShell composes the reducer's deps. The patch sink
// below is deliberately the SAME composition StudioShell injects as the
// reducer's `applyWorkingCopyPatch` (089 contract A4): the `ir` channel's
// containment-checked merge runs first, so a containment failure applies
// nothing; overlay channels then land as whole-value replaces; a null
// working IR skips only the `ir` channel. Gallery applies execute through
// this sink so a decision's effect lands identically whether a question
// runner or the gallery host ran it.

import { getDecisionSnapshot, useDecisionStore } from "../stores/decisionStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { applyMutatePatch } from "../steps/mutateApply.ts";
import type { GalleryHostDeps } from "../steps/galleryHost.tsx";

/** Compose the live gallery-host deps from the decision + working-copy stores. */
export function buildGalleryHostDeps(): GalleryHostDeps {
  return {
    recordDecision: (record) => useDecisionStore.getState().record(record),
    getDecisions: () => getDecisionSnapshot(),
    getWorkingIR: () => useWorkingCopyStore.getState().ir,
    getHistoryEntryState: () => useWorkingCopyStore.getState().historyEntryState,
    applyWorkingCopyPatch: (patch, writes) => {
      const wc = useWorkingCopyStore.getState();
      if (patch.ir !== undefined && wc.ir !== null) {
        wc.setWorkingIR(applyMutatePatch(wc.ir, patch.ir, writes));
      }
      if (patch.identity !== undefined) wc.setIdentity(patch.identity);
      if (patch.attribution !== undefined) wc.setAttribution(patch.attribution);
      if (patch.helpDocs !== undefined) wc.setHelpDocs(patch.helpDocs);
      if (patch.historyEntryState !== undefined) wc.setHistoryEntryState(patch.historyEntryState);
    },
  };
}

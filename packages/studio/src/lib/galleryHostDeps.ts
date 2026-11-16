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
import { CAPS_DECISION_ID, commitCapsOnOpen } from "./openCapsCommit.ts";
import { isLiveOpen } from "./openMode.ts";
import type { GalleryHostDeps } from "../steps/galleryHost.tsx";

/** Compose the live gallery-host deps from the decision + working-copy stores. */
export function buildGalleryHostDeps(): GalleryHostDeps {
  return {
    recordDecision: (record) => {
      journalDecisionWrite([record.id]);
      useDecisionStore.getState().record(record);
      // Open (spec 111 FR-041): the caps module's `apply` returns no patch, so the sink never
      // runs for it; an answered value is written into the files here, right after it is
      // recorded (a seeded default is a record only, and is left alone).
      if (record.id === CAPS_DECISION_ID && isLiveOpen(useWorkingCopyStore.getState())) {
        commitCapsOnOpen({ decisionIds: [CAPS_DECISION_ID] });
      }
    },
    getDecisions: () => getDecisionSnapshot(),
    getWorkingIR: irForApply,
    getHistoryEntryState: () => useWorkingCopyStore.getState().historyEntryState,
    getDocFixProposals: () => useWorkingCopyStore.getState().docFixProposals,
    applyWorkingCopyPatch: applyPatchToWorkingCopy,
  };
}

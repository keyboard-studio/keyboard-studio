// physicalLayoutValue — the physical-layout decision's value and its
// derivation from the working copy's phase results (spec 090 T041,
// execution shape D-090-38).
//
// The value type lives here, in the assign-loop feature home (the
// D-090-8 pattern — carveValue.ts, ruleSetValue.ts): the gallery
// module (survey/questions/gallery/physicalLayout.ts) may not import
// stores or lib, so the shape it re-exports is declared beside the
// state it snapshots. `currentPhysicalLayoutValue()` is shared by
// AddPhysicalAdapter's completion recording and the module's decision
// renderer so the two surfaces never compute different values (the
// currentCarvedLayoutValue precedent).

import type { MechanismAssignment } from "@keyboard-studio/contracts";
import { selectDesktopAssignments } from "../../lib/unimplementedInventory.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";

/** The physical-layout decision value (data-model.md). */
export interface PhysicalLayoutValue {
  assignments: MechanismAssignment[];
}

/**
 * Build the decision value from the working copy's phase results.
 *
 * The value is exactly the assignment set the gallery itself works
 * with: `selectDesktopAssignments` — the phase-C entry's assignments
 * filtered to the physical modality — is the same selector
 * MechanismGallery derives its `sessionAssignments` from, so the
 * recorded value can never diverge from what the author saw and
 * edited. Each assignment rides verbatim, including its `source`
 * provenance (hand-set vs suggested — data-model.md; the refresh /
 * survival behaviour is repropagate's contract, preserved by the
 * completion wiring in lib/assignLoopCompletion.ts).
 *
 * The list is copied; item objects are shared with the phase result
 * (assignments are treated as immutable everywhere — recordAssignments
 * replaces the list wholesale on every edit).
 */
export function physicalLayoutValueFromPhaseResults(
  phaseResults: Parameters<typeof selectDesktopAssignments>[0],
): PhysicalLayoutValue {
  return { assignments: [...selectDesktopAssignments(phaseResults)] };
}

/** The physical-layout value from the live working copy. */
export function currentPhysicalLayoutValue(): PhysicalLayoutValue {
  return physicalLayoutValueFromPhaseResults(
    useWorkingCopyStore.getState().phaseResults,
  );
}

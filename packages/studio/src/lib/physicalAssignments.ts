// physicalAssignments — shared helper for extracting physical-modality
// MechanismAssignments from raw phaseResults.
//
// Used by useWorkingCopyTransform (hook) and serializeWorkingCopy (async
// serializer). Both read phaseResults from the working-copy store and need
// the same flat list of physical assignments before passing them to
// projectWorkingCopyVfs.

import type { MechanismAssignment, SurveyPhaseResult } from "@keyboard-studio/contracts";

/**
 * Flatten all physical-modality {@link MechanismAssignment}s from the raw
 * phase results.  The order mirrors the phase order so the last-wins merge
 * in {@link projectWorkingCopyVfs} is deterministic.
 *
 * This is distinct from `session.assignments` (the merged/last-wins view
 * maintained by the store selector) — callers that need the merged view
 * should read from the store directly.
 */
export function physicalAssignmentsOf(
  phaseResults: SurveyPhaseResult[],
): MechanismAssignment[] {
  return phaseResults
    .flatMap((p) => p.assignments ?? [])
    .filter((a) => a.modality === "physical");
}

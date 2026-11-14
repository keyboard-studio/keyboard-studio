// assignedKeys -- the keys this session's physical assignments claim (spec 117 ruling 10).
//
// The Code tab's Apply asks which keys the Assign tab owns, so an edit to a rule on one of them is
// anchored by key and flagged. The claim is computed fresh from the recorded assignments, the same
// way the projection computes it (claimedInputs), so the two cannot disagree. Read-only: no writes.

import type { Pattern } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { claimedKeystrokes, type AssignedKey } from "./claimedInputs.ts";
import { physicalAssignmentsOf } from "./physicalAssignments.ts";
import { getPatternLibraryService } from "./services.ts";

export async function loadAssignedKeys(): Promise<AssignedKey[]> {
  const { startIr, phaseResults } = useWorkingCopyStore.getState();
  if (startIr === null) return [];
  const assignments = physicalAssignmentsOf(phaseResults);
  if (assignments.length === 0) return [];
  const library = getPatternLibraryService();
  const cache = new Map<string, Pattern>();
  await Promise.all(
    [...new Set(assignments.flatMap((a) => a.mechanisms.map((m) => m.patternId)))].map(async (id) => {
      const pattern = await library.getById(id);
      if (pattern !== undefined) cache.set(id, pattern);
    }),
  );
  return claimedKeystrokes(startIr, assignments, (id) => cache.get(id));
}

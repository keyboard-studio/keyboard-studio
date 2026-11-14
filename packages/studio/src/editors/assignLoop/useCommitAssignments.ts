// useCommitAssignments -- the Mechanisms gallery's "record this assignment
// list", aware of Open (spec 111 "live files", slice S2).
//
// Copy (and an older Open draft with no descriptor) is exactly the store's
// `recordAssignments`: the list goes to `phaseResults` and the projection
// replays it. On Open the list is not held: the gallery hands over the whole
// next list, this diffs it against the applied session list and writes the
// difference into the files when the author applies it (`applyOnOpen`, kind
// `assign`). `phaseResults` for the assignments phase stays empty.
//
// The list the gallery reads as "this session's assignments" is
// `hooks/useSessionAssignments` (`phaseResults` on Copy, the applied list on Open).

import { useCallback } from "react";
import type { MechanismAssignment } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { assignmentFingerprint } from "../../stores/openAssignStore.ts";
import { selectSessionAssignments } from "../../lib/sessionAssignments.ts";
import { useApplyOnOpen } from "../../components/OpenApplyHost.tsx";
import { useIsLiveOpen } from "../carve/useRemovalActions.ts";

export function useCommitAssignments(): (next: MechanismAssignment[]) => void {
  const live = useIsLiveOpen();
  const storeRecord = useWorkingCopyStore((s) => s.recordAssignments);
  const applyOnOpen = useApplyOnOpen();
  return useCallback(
    (next: MechanismAssignment[]): void => {
      if (!live) return storeRecord(next);
      const current = selectSessionAssignments(useWorkingCopyStore.getState());
      const wanted = next.filter((a) => a.modality === "physical");
      const have = new Set(current.map(assignmentFingerprint));
      const want = new Set(wanted.map(assignmentFingerprint));
      const add = wanted.filter((a) => !have.has(assignmentFingerprint(a)));
      const remove = [...have].filter((k) => !want.has(k));
      if (add.length === 0 && remove.length === 0) return;
      // The host's `applyOnOpen` never rejects (it catches and reports), so the
      // dropped promise cannot raise an unhandled rejection.
      void applyOnOpen({ kind: "assign", add, remove });
    },
    [live, storeRecord, applyOnOpen],
  );
}

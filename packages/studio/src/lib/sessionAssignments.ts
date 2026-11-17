// sessionAssignments -- the ONE selector for "this session's physical
// mechanism assignments" (spec 111 FR-042: decisions stay the record).
//
// On Copy they are the phase-C entry of `phaseResults`, replayed by the
// projection. On Open they are written into the files when applied and held
// nowhere for replay (`phaseResults` stays empty); the applied list lives in
// the open-assign session (a cache of the undo log). Every reader that wants
// "what the author assigned" - the decision value, the trail and PR body, the
// coverage gate, the produced set - reads it here, so Open and Copy agree.
// The projection's own replay input stays `physicalAssignmentsOf(phaseResults)`
// on purpose: reading the Open list there would apply it twice.

import type { MechanismAssignment, SurveyPhaseResult } from "@keyboard-studio/contracts";
import { useOpenAssignStore, type OpenAssignSession } from "../stores/openAssignStore.ts";
import { selectDesktopAssignments } from "./unimplementedInventory.ts";

export function selectSessionAssignments(
  wc: { phaseResults: readonly SurveyPhaseResult[]; startKeyboard: { id: string } | null },
  openSession: OpenAssignSession | null = useOpenAssignStore.getState().session,
): MechanismAssignment[] {
  if (openSession !== null && wc.startKeyboard !== null && openSession.keyboardId === wc.startKeyboard.id) {
    return openSession.assignments;
  }
  return selectDesktopAssignments(wc.phaseResults);
}

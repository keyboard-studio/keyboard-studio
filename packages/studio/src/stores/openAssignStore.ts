// openAssignStore -- the Mechanisms assignments applied to an opened keyboard
// this session (spec 111 "live files", slice S2).
//
// On Open an assignment is written into the files when the author applies it
// (`lib/openApply.ts`, kind `assign`), so `phaseResults` never holds it and
// nothing replays it at output. This session list is what the gallery needs
// to keep working like it does on Copy: which characters were assigned this
// session, and how to take one back (unassign).
//
// What unassign needs, and why it is kept here:
//   - `lines`: the rule and store lines the assignments added to the `.kmn`
//     (blank and comment lines are left out: they are cosmetic). Unassign
//     takes these exact lines out again, and refuses when one has been edited
//     in code since.
//   - `base` / `lastAfter`: the text of every file the session changed, just
//     before the first change and just after the latest one. While no other
//     tool has touched those files (`fast`), unassign puts the base back, so
//     the result is byte-identical to the keyboard before the assignment. The
//     keycap labels (`.kvks`, touch layout) can only be put back this way,
//     which is why `labelsOk` goes false once another tool changes them.
//   - `claimed`: the keyboard's own rules the assignments shadow, which are
//     taken out with them exactly as the output does; unassign puts them back.
//
// Session state only, and a cache: the list is rebuilt from the undo log
// (`openUndoStore`) on every change, so undo needs nothing special here. Not
// in the draft snapshot. `clearOpenSession` empties it. No timers.

import { create } from "zustand";
import type { MechanismAssignment } from "@keyboard-studio/contracts";
import type { RemovedRuleRecord } from "./openRemovalStore.ts";

/** A line an assignment added: its text and its 0-based line index when it was added. */
export interface OpenAssignLine {
  text: string;
  at: number;
}

export interface OpenAssignSession {
  keyboardId: string;
  /** Applied assignments, in the order they were added; object identity is stable. */
  assignments: MechanismAssignment[];
  /** Functional lines (rules, stores) the assignments added to the `.kmn`, with where each landed. */
  lines: OpenAssignLine[];
  /** Text of each file the session changed, before the first change (`null` = absent). */
  base: Record<string, string | null>;
  /** Text of those files just after the latest change. */
  lastAfter: Record<string, string | null>;
  /** True while no other tool has changed any session file since the first change. */
  fast: boolean;
  /** True while no other tool has changed the label files (`.kvks`, touch layout) since. */
  labelsOk: boolean;
  /** The keyboard's own rules the assignments shadow, as taken out. */
  claimed: RemovedRuleRecord[];
}

interface OpenAssignState {
  /** A cache of the undo log (see `openUndoStore`); never written by hand. */
  session: OpenAssignSession | null;
  /**
   * The marks completion the author declined to have written into the file
   * (a reformat was needed), as `<keyboardId>|<completion json>`. Not asked
   * again for the same completion. Session memory, emptied by `clearOpenSession`.
   */
  declinedMarks: string | null;
  declineMarks: (key: string) => void;
  clear: () => void;
}

export const useOpenAssignStore = create<OpenAssignState>((set) => ({
  session: null,
  declinedMarks: null,
  declineMarks: (key) => set({ declinedMarks: key }),
  clear: () => set({ session: null, declinedMarks: null }),
}));

/** Stable identity of an assignment: what it targets and what it writes. */
export function assignmentFingerprint(a: MechanismAssignment): string {
  const sorted = (o: Record<string, string> | undefined): [string, string][] =>
    Object.entries(o ?? {}).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0));
  return JSON.stringify([
    a.modality,
    a.scope,
    a.target,
    a.mechanisms.map((m) => [m.patternId, m.strategyId, sorted(m.slotValues)]),
  ]);
}

// decisionJournal -- remembers the decision records the LAST write batch
// replaced, so a change on a keyboard opened for update that is declined or
// fails can put the record back (spec 111 FR-009 "declining leaves the change
// unapplied", FR-042 "decisions are the record"): the record must match the
// files. No new decision field and no new store writer: it only calls the
// decision store's existing `record` and `forget`, and drops the trail entries
// the step recorded for the same decisions after the change was handed over.
//
// The reducer's `writeDecisionRecords` and the gallery host's `recordDecision`
// call `journalDecisionWrite(ids)` just BEFORE they write; each call replaces
// the journal, so it always describes the batch the patch that follows came from.

import { useDecisionStore, getDecisionSnapshot } from "../stores/decisionStore.ts";
import type { Decision, DecisionId } from "../decisions/decisionTypes.ts";
import { deepEqual } from "../decisions/deepEqual.ts";

// The trail (decision log) is reached through a registration, not an import: the
// log store imports the question registry, and this module is on the patch sink's
// import path, so a direct import would close a cycle that breaks module load.
// `decisionLogStore.ts` registers itself when it loads.
type TrailRollback = (decisionIds: ReadonlySet<string>) => (restored: ReadonlySet<string>) => void;
let trailRollback: TrailRollback | null = null;

export function setTrailRollback(next: TrailRollback): void {
  trailRollback = next;
}

let journal = new Map<string, Decision | undefined>();

/** Call just before a decision write: remember what each id held. */
export function journalDecisionWrite(ids: readonly string[]): void {
  const now = getDecisionSnapshot();
  journal = new Map(ids.map((id) => [id, now[id as keyof typeof now]]));
}

/**
 * Capture how to take back the decisions behind a handed-over change. Returns
 * null when none of `ids` is in the journal (nothing was just recorded for it).
 */
export function captureDecisionRollback(ids: readonly string[]): (() => void) | null {
  const mine = ids.filter((id) => journal.has(id));
  if (mine.length === 0) return null;
  const snapshot = getDecisionSnapshot();
  // What the step recorded (captured now) and what each id held before it.
  const entries = mine.map((id) => ({
    id,
    previous: journal.get(id),
    recorded: snapshot[id as keyof typeof snapshot],
  }));
  // Captured once: a later change must not read these as its own "previous" values.
  for (const id of mine) journal.delete(id);
  const pruneTrail = trailRollback?.(new Set(mine)) ?? (() => {});
  return () => {
    const store = useDecisionStore.getState();
    const current = getDecisionSnapshot();
    const restored = new Set<string>();
    for (const { id, previous, recorded } of entries) {
      // The author may have answered again while the change waited: only a
      // decision still holding what the step recorded is taken back.
      if (!deepEqual(current[id as keyof typeof current], recorded)) continue;
      restored.add(id);
      if (previous === undefined) store.forget(id as DecisionId);
      else store.record(previous);
    }
    // Trail entries the step appended for the decisions that were taken back.
    pruneTrail(restored);
  };
}

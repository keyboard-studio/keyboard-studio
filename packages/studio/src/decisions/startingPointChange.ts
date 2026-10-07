// startingPointChange — a starting-point change is a RECALCULATION
// (spec 093 T017; owner ruling (a), km-lead proposals Q6, recorded at
// T013). Not a reset, not a migration: the decision set is carried over
// the new starting point and every record is re-evaluated under the
// provenance rule (US1) against it —
//
//   extracted  — re-extracted against the new bundle; the superseding
//                record's `source` names the NEW keyboard (the caller
//                passes it as `deps.source`). Prior records are not
//                rewritten in place: the outcome's `recordsToWrite`
//                carries the superseding records, and the decision log
//                keeps the prior entries — with their old source — as
//                history.
//   default / derived — recomputed (via the module's lookup default /
//                extract, the landed computeFreshValue sources).
//   asked      — kept whole under the validate/re-propose rule: still
//                valid → untouched (its record, including an old
//                `source`, stands as history); no longer fits → kept,
//                flagged, and the recomputed value is offered beside it
//                (`offered`), never overwritten.
//   gated off  — the record is kept and marked `inactive`; a gate that
//                clears restores it unchanged.
//
// Mechanically this is the T009 rebuild with the widest possible
// closure: the change's cause sits OUTSIDE the decision graph, so no
// record is an author-changed record (the `changed` set is empty and
// nothing stands exempt), the recalculation visits every record
// (`visitAll`), and the replay is a full replay from checkpoint 0 over
// the new starting point with a freshly seeded trail — the old trail's
// checkpoints fold over the OLD starting point and are meaningless
// here. The returned outcome's `trail` is the new trail; a caller that
// keeps session state adopts it.
//
// Wiring (owner ruling (b), Matthew 2026-10-07 — supersedes the T017
// stop recorded in followups.md): a base switch is RETAIN + RECALCULATE.
// StudioShell's `doCommit` runs the live entry
// (`recalculateForStartingPointChangeFromStores` in
// rebuildWorkingCopy.ts, which assembles this same request against the
// live stores) on a genuine switch, after instantiation and the live
// extraction pass; the rebase consent copy was reworded in the same
// change to promise exactly this semantics.

import type { KeyboardIR } from "@keyboard-studio/contracts";
import type { DecisionId, DecisionSet } from "./decisionTypes.ts";
import {
  rebuildWorkingCopy,
  type RebuildDeps,
  type RebuildOutcome,
} from "./rebuildWorkingCopy.ts";
import { seedTrail } from "./replayCheckpoints.ts";

export interface StartingPointChangeRequest {
  /** The decision set carried over the change, as recorded. */
  decisions: DecisionSet;
  /** The NEW starting point's IR — the replay folds over it. */
  startingPointIR: KeyboardIR;
}

/**
 * Recalculate `request.decisions` against a new starting point and
 * rebuild the working copy by full replay over it. `deps` are the T009
 * rebuild deps pointed at the NEW bundle: `extractContext` reads it and
 * `source` names it (catalog id preferred) so re-extracted records name
 * the new keyboard as their source.
 */
export function recalculateForStartingPointChange(
  deps: RebuildDeps,
  request: StartingPointChangeRequest,
): RebuildOutcome {
  return rebuildWorkingCopy(deps, {
    decisions: request.decisions,
    changed: new Set<DecisionId>(),
    startingPointIR: request.startingPointIR,
    trail: seedTrail(request.startingPointIR),
    visitAll: true,
  });
}

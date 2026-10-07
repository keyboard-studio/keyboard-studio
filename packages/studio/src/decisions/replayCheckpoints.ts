// replayCheckpoints — in-memory per-decision checkpoints (spec 093 FR-003,
// research §4).
//
// A checkpoint is the folded state (IR **and overlay accumulator**, I-1)
// after each decision's `apply`, retained by reference — patches produce
// new IRs, so a checkpoint is a retained reference, not a copy. The trail
// is never persisted and never serialised (Article V's spirit): it lives
// beside the replay engine for the session that built it.
//
// Layout: `trail[k]` is the state after the first k decisions of the
// derived order; `trail[0]` is the starting point + empty overlay, before
// any `apply` (its `decisionId` is null). An edit to the decision at order
// position p replays from `trail[p]` — the checkpoint BEFORE that decision
// — over `order[p..]`, and the fresh span replaces the trail's tail.

import type { KeyboardIR } from "@keyboard-studio/contracts";
import type { DecisionId } from "./decisionTypes.ts";
import {
  emptyOverlay,
  replayKeyboard,
  type DecisionProvider,
  type ReplayCheckpoint,
  type ReplayOutcome,
  type ReplayState,
} from "./replayKeyboard.ts";

export type { ReplayCheckpoint } from "./replayKeyboard.ts";

/** A full checkpoint trail for one derived order: `trail[k].orderIndex === k`. */
export type CheckpointTrail = readonly ReplayCheckpoint[];

/** The seed trail: index 0 only — the starting point + the empty overlay. */
export function seedTrail(startingPointIR: KeyboardIR): CheckpointTrail {
  return [
    {
      decisionId: null,
      orderIndex: 0,
      ir: startingPointIR,
      overlay: emptyOverlay(),
    },
  ];
}

/**
 * The checkpoint an edit to `decisionId` replays from: the state after the
 * decision just before it in the derived order (index 0 for the first).
 * Returns undefined when the id is not in the order — the caller then
 * falls back to a full replay.
 */
export function checkpointBefore(
  trail: CheckpointTrail,
  order: readonly DecisionId[],
  decisionId: DecisionId,
): ReplayCheckpoint | undefined {
  const position = order.indexOf(decisionId);
  if (position < 0) return undefined;
  return trail[position];
}

/**
 * The earliest resume point for a set of changed decisions: the smallest
 * order position among them, and the checkpoint at that position. A
 * change outside the order yields undefined (full replay).
 */
export function resumePointFor(
  trail: CheckpointTrail,
  order: readonly DecisionId[],
  changed: ReadonlySet<DecisionId>,
): { index: number; checkpoint: ReplayCheckpoint } | undefined {
  let index = Number.POSITIVE_INFINITY;
  for (const id of changed) {
    const position = order.indexOf(id);
    if (position >= 0 && position < index) index = position;
  }
  if (!Number.isFinite(index)) return undefined;
  const checkpoint = trail[index];
  return checkpoint === undefined ? undefined : { index, checkpoint };
}

/**
 * Splice a replay outcome's span into a trail: everything before the
 * span's start index is kept, the span's checkpoints replace the tail.
 * The outcome's first checkpoint restates the resume state, so the kept
 * prefix ends one earlier.
 */
export function spliceTrail(
  trail: CheckpointTrail,
  outcome: ReplayOutcome,
): CheckpointTrail {
  const start = outcome.checkpoints[0]?.orderIndex ?? 0;
  return [...trail.slice(0, start), ...outcome.checkpoints];
}

/**
 * Incremental replay (FR-003): resume from the checkpoint before the
 * earliest changed decision and fold only the order's tail from there.
 * Falls back to a full replay when the trail does not cover the order
 * (a stale trail is a caller bug, but a wrong resume is worse than a
 * slow one — the fallback keeps the result honest). Returns the outcome
 * and the spliced, now-current trail.
 */
export function replayFromCheckpoint(
  providerFor: DecisionProvider,
  trail: CheckpointTrail,
  request: {
    decisions: Parameters<typeof replayKeyboard>[1]["decisions"];
    order: readonly DecisionId[];
    changed: ReadonlySet<DecisionId>;
    startingPointIR: KeyboardIR;
  },
): { outcome: ReplayOutcome; trail: CheckpointTrail } {
  const resume = resumePointFor(trail, request.order, request.changed);
  const usable =
    resume !== undefined &&
    trail.length === request.order.length + 1 &&
    resume.checkpoint.ir !== undefined;
  if (!usable) {
    const outcome = replayKeyboard(providerFor, {
      decisions: request.decisions,
      order: request.order,
      startingPointIR: request.startingPointIR,
    });
    return { outcome, trail: outcome.checkpoints };
  }
  const fromState: ReplayState = {
    ir: resume.checkpoint.ir,
    overlay: resume.checkpoint.overlay,
  };
  const outcome = replayKeyboard(providerFor, {
    decisions: request.decisions,
    order: request.order,
    fromIndex: resume.index,
    fromState,
  });
  return { outcome, trail: spliceTrail(trail, outcome) };
}

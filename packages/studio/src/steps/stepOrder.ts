// stepOrder — the wizard's step order and side-trail structure, DERIVED.
//
// The decision registry is the single source of order (spec 085 Q3). Steps
// declare provides / requires / gatedBy (steps/stepDependencies.ts) and are
// sorted by the same implementation that orders questions
// (decisions/orderDecisions.ts `orderByDependencies`) — there is no second sort
// and no hand-maintained list of step ids.
//
// Exists as plain data so a store can order per-step data by the wizard order
// without importing the manifest itself (which imports every step component,
// and so, at runtime, the stores — a cycle). stepOrder.parity.test.ts asserts
// the manifest array equals STEP_ORDER, so they cannot drift.

import type { DecisionId, DecisionSet } from "../decisions/decisionTypes.ts";
import { orderByDependencies } from "../decisions/orderDecisions.ts";
import { DECLARED_STEP_IDS, stepDependencies } from "./stepDependencies.ts";

/** What the sort reads from a step. */
export interface StepOrderable {
  readonly id: string;
  readonly provides?: readonly DecisionId[] | undefined;
  readonly requires?: readonly DecisionId[] | undefined;
  readonly gatedBy?: ((decisions: DecisionSet) => boolean) | undefined;
}

/** Topologically order steps by their declared provides/requires. */
export function orderSteps<T extends StepOrderable>(steps: readonly T[]): T[] {
  return orderByDependencies(steps, (s) => s);
}

/**
 * A step's place in the flow, derived rather than flagged.
 *
 * spine: false  — the step is conditionally gated (a side trail).
 * joinTarget    — a side trail's next UNGATED successor in the derived order:
 *                 where it rejoins the main line. Absent on spine steps, and
 *                 absent on a gated step with no ungated successor (a dead end,
 *                 which completeness check C3 reports).
 */
export interface StepTrail {
  readonly spine: boolean;
  readonly joinTarget?: string;
}

/**
 * Derive each step's trail from an already-ordered step list: a step with a
 * `gatedBy` is a side trail and rejoins at the next step without one.
 */
export function deriveStepStructure(
  ordered: readonly Pick<StepOrderable, "id" | "gatedBy">[],
): ReadonlyMap<string, StepTrail> {
  const trails = new Map<string, StepTrail>();
  ordered.forEach((step, i) => {
    if (step.gatedBy === undefined) {
      trails.set(step.id, { spine: true });
      return;
    }
    const join = ordered.slice(i + 1).find((s) => s.gatedBy === undefined);
    trails.set(step.id, join === undefined ? { spine: false } : { spine: false, joinTarget: join.id });
  });
  return trails;
}

const orderedSteps = orderSteps(
  DECLARED_STEP_IDS.map((id) => ({ id, ...stepDependencies(id) })),
);

/** The wizard's step ids, in derived order. */
export const STEP_ORDER: readonly string[] = orderedSteps.map((s) => s.id);

/** Each step's derived trail (spine membership and join target), by id. */
export const STEP_TRAILS: ReadonlyMap<string, StepTrail> = deriveStepStructure(orderedSteps);

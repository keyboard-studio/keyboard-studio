// stepOrder — the wizard's step order and side-trail structure, DERIVED.
//
// The decision registry is the single source of order (spec 087 Q3). Steps
// declare provides / requires / gatedBy (steps/stepDependencies.ts) and are
// sorted by the same implementation that orders questions
// (decisions/orderDecisions.ts `orderByDependencies`) — there is no second sort
// and no hand-maintained list of step ids.
//
// Exists as plain data so a store can order per-step data by the wizard order
// without importing the manifest itself (which imports every step component,
// and so, at runtime, the stores — a cycle). stepOrder.parity.test.ts asserts
// the manifest array equals STEP_ORDER, so they cannot drift.
//
// Spec 091 T008 note (Delta P4): deriving STEP_ORDER from deriveScreens
// over the registry's decisionModules was landed and then REVERTED in
// Phase 3. This module is reached during registry evaluation
// (registry → gallery renderer → stores → dashboard/completeness →
// stepOrder), so reading the registry's module list at this module's top
// level observes it uninitialised under store-first entry orders — the
// D-090-7 cycle. stepDependencies.ts reads only the flowModules leaf,
// which is why it is safe here. The screen-derived STEP_ORDER returns
// with Phase 4's rewiring (T012–T016), which deletes stepDependencies
// and re-points the store/dashboard consumers anyway.

import type { DecisionId, DecisionSet } from "../decisions/decisionTypes.ts";
import { deriveStepStructure, orderByDependencies } from "../decisions/orderDecisions.ts";
import type { StepTrail } from "../decisions/orderDecisions.ts";
import { DECLARED_STEP_IDS, stepDependencies } from "./stepDependencies.ts";

// The trail derivation lives in decisions/orderDecisions.ts (spec 091 —
// decisions/deriveScreens.ts applies it to screens and may not import
// steps/); re-exported here for this module's existing consumers.
export { deriveStepStructure };
export type { StepTrail };

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

const orderedSteps = orderSteps(
  DECLARED_STEP_IDS.map((id) => ({ id, ...stepDependencies(id) })),
);

/** The wizard's step ids, in derived order. */
export const STEP_ORDER: readonly string[] = orderedSteps.map((s) => s.id);

/** Each step's derived trail (spine membership and join target), by id. */
export const STEP_TRAILS: ReadonlyMap<string, StepTrail> = deriveStepStructure(orderedSteps);

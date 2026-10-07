// stepOrder — the wizard's step order and side-trail structure, DERIVED.
//
// The decision registry is the single source of order (spec 087 Q3), and
// since spec 091 T008 the step order is the DERIVED SCREEN order
// (decisions/deriveScreens.ts over the registry's decisionModules): screens
// are what the wizard walks, so STEP_ORDER is their ids, plus the ruled
// terminal "package" screen (no module settles it; it packages the derived
// result). steps/stepDependencies.ts still exists until T016 deletes it,
// but it is no longer the source for STEP_ORDER.
//
// Exists as plain data so a store can order per-step data by the wizard order
// without importing the manifest itself (which imports every step component,
// and so, at runtime, the stores — a cycle). stepOrder.parity.test.ts asserts
// the manifest array equals STEP_ORDER, so they cannot drift.

import type { DecisionId, DecisionSet } from "../decisions/decisionTypes.ts";
import { deriveStepStructure, orderByDependencies } from "../decisions/orderDecisions.ts";
import type { StepTrail } from "../decisions/orderDecisions.ts";
import { deriveScreens } from "../decisions/deriveScreens.ts";
import { decisionModules } from "../survey/questions/registry.ts";

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

const derivedScreens = deriveScreens(decisionModules);

/** The wizard's step ids, in derived order (derived screens + "package"). */
export const STEP_ORDER: readonly string[] = [
  ...derivedScreens.map((s) => s.id),
  "package",
];

/** Each step's derived trail (spine membership and join target), by id. */
export const STEP_TRAILS: ReadonlyMap<string, StepTrail> = new Map<string, StepTrail>([
  ...derivedScreens.map(
    (s) =>
      [
        s.id,
        s.joinTarget !== undefined
          ? { spine: s.spine, joinTarget: s.joinTarget }
          : { spine: s.spine },
      ] as const,
  ),
  ["package", { spine: true }],
]);

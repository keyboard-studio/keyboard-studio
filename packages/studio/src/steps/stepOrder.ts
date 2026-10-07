// stepOrder — the wizard's step order and side-trail structure, DERIVED
// from the decision modules (spec 087 Q3; spec 091 T008/T016).
//
// The derivation itself runs once, at the composition root:
// steps/manifest.ts derives the screens from the registry's module list
// (decisions/deriveScreens.ts over each module's provides / requires /
// screenRequires, with the composition layer's declaredScreenGates) and
// publishes them as `derivedScreens` / `screenTrails`. This module
// re-publishes that derivation in the shapes its consumers have always
// read — STEP_ORDER (screen ids in derived order, with the ruled
// terminal "package" screen appended) and STEP_TRAILS — so no consumer
// changes, and there is exactly one derivation, never two.
//
// Why not derive here: this module is reachable during registry
// evaluation, and reading the registry's module list at this module's
// top level observes it uninitialised under store-first entry orders
// (the D-090-7 init cycle; plan.md Delta P4 records the Phase 2 landing
// of exactly that shape and its revert). The path that once reached
// this module mid-evaluation (workingCopyStore → dashboard/completeness
// → stepOrder) was cut by T014 — completeness now receives the trails
// threaded from the manifest — and the remaining consumers (manifest
// validation, steps/advance.ts) already read the manifest. The
// hand-declared step table this module previously derived from is
// deleted in the same change (spec 091 T016).

import type { DecisionId, DecisionSet } from "../decisions/decisionTypes.ts";
import { orderByDependencies } from "../decisions/orderDecisions.ts";
import type { StepTrail } from "../decisions/orderDecisions.ts";
import { derivedScreens, screenTrails } from "./manifest.ts";

// The trail derivation lives in decisions/orderDecisions.ts (spec 091 —
// decisions/deriveScreens.ts applies it to screens and may not import
// steps/); re-exported here for this module's existing consumers.
export { deriveStepStructure } from "../decisions/orderDecisions.ts";
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

/** The wizard's step ids, in derived screen order (plus the terminal). */
export const STEP_ORDER: readonly string[] = [
  ...derivedScreens.map((s) => s.id),
  "package",
];

/** Each step's derived trail (spine membership and join target), by id. */
export const STEP_TRAILS: ReadonlyMap<string, StepTrail> = screenTrails;

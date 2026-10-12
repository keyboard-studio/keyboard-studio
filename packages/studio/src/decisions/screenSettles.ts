// screenSettles — which decisions a screen settles that no question
// module asks for, over the LIVE registry. Re-homed here at the flip
// (spec 091 T016) from the deleted steps/stepDependencies.ts, whose
// hand-kept `settles` lists this derivation replaces.
//
// A screen settles the decisions its gallery (custom-renderer) members
// provide — see decisions/deriveScreens.ts `settlesByScreen` for the pure
// derivation. Two readers:
//   - the decision recorder (decisions/createStudioDecisionRecorder.ts),
//     which logs one entry per settled gallery decision at completion
//     (spec 090 US5);
//   - the spec-088 draft migration (lib/draftPersistence.ts), which
//     tells retained gallery answers from orphaned question answers.
//
// The map is computed LAZILY on first call and memoised. Both readers are
// reachable during the registry's own module evaluation (via stores and
// renderers), and reading the registry's module list at THIS module's
// top level would observe it uninitialised under store-first entry
// orders — the D-090-7 init cycle that reverted T008's first landing
// (plan.md Delta P4). The static import below is never read at module
// scope; by call time every module has evaluated.

import { decisionModules, declaredScreenGates } from "../survey/questions/registry.ts";
import type { DecisionId } from "./decisionTypes.ts";
import { settlesByScreen } from "./deriveScreens.ts";
import { resolveLegacyStepId } from "./legacyStepIds.ts";

let cache: ReadonlyMap<string, readonly DecisionId[]> | undefined;

function liveSettles(): ReadonlyMap<string, readonly DecisionId[]> {
  if (cache === undefined) {
    cache = settlesByScreen(decisionModules, declaredScreenGates);
  }
  return cache;
}

/**
 * The decisions the given step/screen settles that no question module
 * asks for, or `[]` for an unknown id. Never throws: the recorder runs
 * inside a step transition and must not fail one over an undeclared id.
 * Pre-091 step ids resolve through the frozen legacy map first.
 */
export function settlesForStep(id: string): readonly DecisionId[] {
  return liveSettles().get(resolveLegacyStepId(id)) ?? [];
}

/**
 * Whether the given step/screen settles any decision no question module
 * asks for — i.e. it is a gallery/editor step whose saved answers are not
 * survey-question answers.
 */
export function stepHasSettles(id: string): boolean {
  return settlesForStep(id).length > 0;
}

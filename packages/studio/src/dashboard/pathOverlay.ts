// pathOverlay — which steps and transitions one keyboard actually walked
// (specs/053-decision-audit FR-023; trail-ui.contract.md §5).
//
// ADR-0001 IS NOT REVERSED, and this module is where that claim has to hold.
//
// The flow map is a structural projection of one source: `buildStepGraph` over
// `steps/manifest.ts`. This adds a per-keyboard DECORATION over that graph and
// nothing else. It contributes no node, no edge, and no ordering — it returns two
// sets of ids, and a renderer can only use them to look up something the graph
// already contains. A step id in `walkedSteps` that the graph does not have
// therefore decorates nothing (asserted in pathOverlay.test.ts), which is the
// mechanical form of "no second source of graph structure".
//
// EDGES ARE DERIVED FROM APPEND ORDER, not from the graph's own edge list. The
// record knows the order decisions were made; the graph knows which transitions
// exist. Intersecting the two is the renderer's job — deriving an edge here from
// the graph would make the overlay agree with the map by construction and stop it
// being evidence of anything. So `s0->s1` appears in `walkedEdges` because the
// author went from `s0` to `s1`, whether or not the manifest declares that edge.
//
// TWO THINGS ARE DELIBERATELY EXCLUDED:
//
//   1. `PRE_IDENTITY_STEP_ID`. It is a placeholder for "before any step was
//      known", not a step — including it would put a node id on the map that the
//      manifest has never contained, and would fabricate an edge into whichever
//      step happened to come first.
//
//   2. Nothing else. Superseded entries stay IN: a revisited step really was
//      walked, twice. Duplicate steps and duplicate edges collapse because these
//      are sets, so a revisit cannot double-count an edge.

import { PRE_IDENTITY_STEP_ID, type DecisionRecord } from "@keyboard-studio/contracts";

export interface PathOverlay {
  /** Step ids the recorded keyboard traversed. */
  walkedSteps: ReadonlySet<string>;
  /** Traversed edges, as `${fromStepId}->${toStepId}`. */
  walkedEdges: ReadonlySet<string>;
}

/** The `walkedEdges` key for one transition. One place, so the renderer agrees. */
export function edgeKey(fromStepId: string, toStepId: string): string {
  return `${fromStepId}->${toStepId}`;
}

/** An overlay that decorates nothing — the no-keyboard-selected case (FR-024). */
export function emptyPathOverlay(): PathOverlay {
  return { walkedSteps: new Set(), walkedEdges: new Set() };
}

/**
 * Project a decision record onto the walked path.
 *
 * Pure, and cheap enough to run on every render: one pass over the entries.
 */
export function buildPathOverlay(record: DecisionRecord): PathOverlay {
  const walkedSteps = new Set<string>();
  const walkedEdges = new Set<string>();

  // Consecutive entries in the SAME step are one visit, not a self-transition, so
  // the previous step advances only when the step id actually changes.
  let previousStepId: string | null = null;
  for (const entry of record.entries) {
    const stepId = entry.stepId;
    if (stepId === PRE_IDENTITY_STEP_ID) continue;
    walkedSteps.add(stepId);
    if (previousStepId !== null && previousStepId !== stepId) {
      walkedEdges.add(edgeKey(previousStepId, stepId));
    }
    previousStepId = stepId;
  }

  return { walkedSteps, walkedEdges };
}

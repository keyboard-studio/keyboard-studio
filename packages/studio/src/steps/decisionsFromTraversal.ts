// decisionsFromTraversal — the one place that turns traversal state into the
// `DecisionSet` a step's `gatedBy` (steps/stepDependencies.ts) is evaluated
// over. advance() and resolveLocation() both gate steps; before this helper each
// hand-built the literal, so the decision ids lived in two places and the
// difference between them (resolveLocation omits the touch seed) was only a
// comment. The seed is now an explicit optional parameter: leaving it out at a
// call site is visible, not implicit.

import type { DecisionSet } from "../decisions/decisionTypes.ts";

/**
 * @param track  The selected authoring track, or null when none is chosen yet
 *               (no `authoring-track` decision is recorded for null).
 * @param touchSeed  The recorded touch-seed choice. Omit it (or pass null) to
 *               leave `touch-seed-source` unrecorded, which is what
 *               resolveLocation does on purpose so a remembered seed does not
 *               strand the jump back to the chooser.
 */
export function decisionsFromTraversal(
  track: string | null,
  touchSeed?: string | null,
): DecisionSet {
  return {
    ...(track !== null && {
      "authoring-track": {
        id: "authoring-track" as const,
        value: track,
        provenance: "asked" as const,
      },
    }),
    ...(touchSeed !== undefined &&
      touchSeed !== null && {
        "touch-seed-source": {
          id: "touch-seed-source" as const,
          value: touchSeed,
          provenance: "asked" as const,
        },
      }),
  };
}

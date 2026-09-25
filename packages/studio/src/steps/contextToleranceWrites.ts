// The IR paths the context-tolerance apply effect may write (spec 078 FR-005,
// Constitution Art. IX). The marks step's own write is the decision; applying
// the accepted rules is a separate effect (hooks/useContextToleranceApply.ts)
// that commits through applyMutatePatch against exactly these paths, so a
// patch touching anything else is rejected by the seam's containment check.
// Spread into the `marks` manifest entry's `writes` so the manifest declares it.

import { ARRAY_INDEX, irPath, type IRPath } from "@keyboard-studio/contracts";

export const CONTEXT_TOLERANCE_WRITES: readonly IRPath[] = [
  // The generated rules, inserted into the groups that hold the gap rules.
  irPath("groups", ARRAY_INDEX, "rules"),
  // The stores the backspace unwrap and store-member variants add.
  irPath("stores", ARRAY_INDEX),
  // The one plain-language comment on each generated block (FR-015).
  irPath("comments", ARRAY_INDEX),
];

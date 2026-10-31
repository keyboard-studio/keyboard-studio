// placementMapLoader -- loads the corpus placement priors and converts them to
// the PlacementMap the mechanism gallery ranks suggestions from.
//
// Lifted out of usePlacementPriors so a headless caller reads the same map the
// gallery does. The hook calls this and holds no second copy. The priors file
// and the converter load lazily (dynamic import) so they stay out of the
// initial bundle.

import type { PlacementMap } from "@keyboard-studio/contracts";

export async function loadPlacementMap(): Promise<PlacementMap> {
  const [mod, { corpusPriorsToPlacementMap, parsePlacementPriorsJSON }] = await Promise.all([
    import("@keyboard-studio/engine/data/placement-priors.json"),
    import("@keyboard-studio/engine/placement"),
  ]);
  const priors = parsePlacementPriorsJSON(mod.default ?? mod);
  return corpusPriorsToPlacementMap(priors);
}

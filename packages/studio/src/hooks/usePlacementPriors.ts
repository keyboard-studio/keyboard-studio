import { useState, useEffect } from "react";
import type { PlacementMap } from "@keyboard-studio/contracts";

/**
 * Lazily loads docs/placement-priors.json and converts it to a PlacementMap.
 * Returns null while loading, on success, or on error (graceful degradation).
 */
export function usePlacementPriors(): PlacementMap | null {
  const [placementMap, setPlacementMap] = useState<PlacementMap | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [mod, { corpusPriorsToPlacementMap }] = await Promise.all([
          import("@docs/placement-priors.json"),
          import("@keyboard-studio/engine/placement"),
        ]);
        if (cancelled) return;
        const priors = (mod.default ?? mod) as import("@keyboard-studio/engine/placement").PlacementPriorsJSON;
        setPlacementMap(corpusPriorsToPlacementMap(priors));
      } catch (err) {
        if (!cancelled) {
          console.warn("Placement priors unavailable:", err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return placementMap;
}

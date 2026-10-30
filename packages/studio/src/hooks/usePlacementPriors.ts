import { devLog } from "@keyboard-studio/contracts/dev-log";
import { useState, useEffect } from "react";
import type { PlacementMap } from "@keyboard-studio/contracts";
import { loadPlacementMap } from "../lib/placementMapLoader.ts";

/**
 * Lazily loads packages/engine/data/placement-priors.json and converts it to
 * a PlacementMap. Returns null while loading, on success, or on error
 * (graceful degradation).
 */
export function usePlacementPriors(): PlacementMap | null {
  const [placementMap, setPlacementMap] = useState<PlacementMap | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const map = await loadPlacementMap();
        if (cancelled) return;
        setPlacementMap(map);
      } catch (err) {
        if (!cancelled) {
          devLog.warn("Placement priors unavailable:", err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return placementMap;
}

import { useState, useEffect } from "react";
import type { PlacementMap } from "@keyboard-studio/contracts";

/**
 * Lazily loads docs/placement-priors.json and converts it to a PlacementMap
 * suitable for MechanismGallery.  Returns null while loading, the map on
 * success, or null on error (graceful degradation — gallery still works
 * without suggestions if the file is missing or malformed).
 *
 * The JSON is loaded via a dynamic import using the @docs Vite alias
 * (resolves to <repoRoot>/docs/) — the same pattern used by BaseKeyboardPicker
 * for import-corpus.json.  The corpus-loader converter runs in the engine's
 * placement module so no engine internals are imported on the main thread
 * synchronously.
 *
 * @see packages/engine/src/placement/corpus-loader.ts
 * @see packages/studio/vite.config.ts (@docs alias)
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
        // mod.default is the JSON object; fallback handles ESM/CJS ambiguity.
        const priors = (mod.default ?? mod) as import("@keyboard-studio/engine/placement").PlacementPriorsJSON;
        setPlacementMap(corpusPriorsToPlacementMap(priors));
      } catch {
        // File missing or malformed — suggestions are unavailable; gallery
        // behaves exactly as without a placementMap prop.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return placementMap;
}

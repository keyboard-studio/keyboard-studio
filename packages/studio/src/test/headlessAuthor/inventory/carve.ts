// Inventory entries for the carve step drivers (spec 107 FR-010); combined into
// INVENTORY by ../driftGuard.ts. Each entry needs a production caller that
// value-imports it and an author file that does too (boundary.test.ts rule d).
// Also holds the convenience driver's entries: the two steps share the needed
// set and the gallery-host recording path.

import type { InventoryEntry } from "./types.ts";

const CONVENIENCE_STEP = "survey/convenience/ConvenienceCharsStep.tsx";
const CONVENIENCE_MODULE = "survey/convenience/convenienceContinue.ts";
const CARVE_GALLERY = "editors/carve/CarveGalleryV2.tsx";
const CARVE_ADAPTER = "editors/adapters/carveAdapter.tsx";

export const carveInventory: readonly InventoryEntry[] = [
  {
    // The hook's needed-set composition once the CLDR/SLDR lookup has settled;
    // the hook itself calls the synchronous composeCarveNeededSet.
    fn: "resolveCarveNeededSet",
    module: "lib/carveNeededSet.ts",
    callers: [],
    provenBy: "lib/carveNeededSet.test.ts",
  },
  { fn: "convenienceGateFor", module: CONVENIENCE_MODULE, callers: [CONVENIENCE_STEP] },
  { fn: "gateCandidates", module: CONVENIENCE_MODULE, callers: [CONVENIENCE_STEP] },
  { fn: "continueConvenience", module: CONVENIENCE_MODULE, callers: [CONVENIENCE_STEP] },
  { fn: "skipConvenience", module: CONVENIENCE_MODULE, callers: [CONVENIENCE_STEP] },
  {
    // The onChange GalleryHost hands a renderer; GalleryHost calls it in the
    // module that defines it, so a test proves the two equal.
    fn: "makeGalleryOnChange",
    module: "steps/galleryHost.tsx",
    callers: [],
    provenBy: "steps/galleryHost.onChange.test.tsx",
  },
  { fn: "buildGalleryHostDeps", module: "lib/galleryHostDeps.ts", callers: ["survey/makeGalleryStepHost.tsx"] },
  {
    // The convenience step's gallery module (default export).
    fn: "default",
    module: "survey/questions/gallery/retainedConvenienceChars.ts",
    callers: ["survey/convenience/ConvenienceStepHost.tsx"],
  },
  { fn: "recordConvenienceStatus", module: CONVENIENCE_MODULE, callers: [CONVENIENCE_STEP] },
  { fn: "carveRecommendation", module: "survey/carve/carveRecommendation.ts", callers: [CARVE_GALLERY] },
  { fn: "applyCarveSuggestion", module: "survey/carve/carveContinue.ts", callers: [CARVE_GALLERY] },
  { fn: "recordCarveDecision", module: "survey/carve/carveContinue.ts", callers: [CARVE_ADAPTER] },
];

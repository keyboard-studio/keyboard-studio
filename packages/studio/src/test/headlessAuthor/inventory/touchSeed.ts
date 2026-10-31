// Inventory entries for the touch seed-source and touch step drivers (spec 107
// FR-010); combined into INVENTORY by ../driftGuard.ts. Each entry needs a
// production caller that value-imports it and an author file that does too
// (boundary.test.ts rule d). Shared helpers other inventories already list
// (buildGalleryHostDeps, makeGalleryOnChange, getDecisionSnapshot) are not
// repeated here.

import type { InventoryEntry } from "./types.ts";

const SEED_PANEL = "survey/touchSeedSource/TouchSeedSourcePanel.tsx";
const SEED_CONTINUE = "survey/touchSeedSource/touchSeedSourceContinue.ts";
const TOUCH_ADAPTER = "editors/adapters/addTouchAdapter.tsx";
const TOUCH_COMPLETION = "lib/touchStepCompletion.ts";

export const touchSeedInventory: readonly InventoryEntry[] = [
  { fn: "defaultTouchSeedSource", module: SEED_CONTINUE, callers: [SEED_PANEL] },
  { fn: "startShipsUsableTouch", module: SEED_CONTINUE, callers: [SEED_PANEL] },
  { fn: "deriveSeedPreview", module: SEED_CONTINUE, callers: [SEED_PANEL] },
  { fn: "clearTouchDraftOnSeedChange", module: SEED_CONTINUE, callers: [SEED_PANEL] },
  { fn: "touchDesktopModifications", module: TOUCH_COMPLETION, callers: [TOUCH_ADAPTER, SEED_PANEL] },
  { fn: "completeTouchStep", module: TOUCH_COMPLETION, callers: [TOUCH_ADAPTER] },
  { fn: "resolveStartTouchJson", module: "lib/resolveStartTouchJson.ts", callers: [SEED_PANEL] },
  { fn: "selectTouchSeedSource", module: "stores/decisionStore.ts", callers: [TOUCH_ADAPTER] },
  {
    // The touch-seed-source gallery module (default export); the step host wraps it.
    fn: "default",
    module: "survey/questions/gallery/touchSeedSource.ts",
    callers: ["survey/touchSeedSource/TouchSeedSourceHost.tsx"],
  },
];

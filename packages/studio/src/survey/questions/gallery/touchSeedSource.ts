// touchSeedSource — gallery decision module for `touch-seed-source` (spec 090).
//
// Migrated in T012 (US1): the renderer is the touch seed fork chooser
// (survey/touchSeedSource/TouchSeedSourcePanel.tsx), hosted by
// TouchSeedSourceHost. The step's asked-while-unrecorded gating is a
// SCREEN gate, declared in the registry's `declaredScreenGates` (spec 091
// Delta P6: spec 087 FR-005 forbids a module-level gatedBy; the gate is
// not routing-expressible for a custom screen); the identical step-level
// `gatedBy` (landed by 088) was retired when spec 091 deleted the step
// table — the registry declaration above is the one source. The decision has no
// working-copy effect of its own (the touch
// step's derivation reads the recorded value), so `apply` is empty.
// Boundary (FR-003): a gallery module is a pure descriptor — no store
// imports; the value arrives via DecisionRendererProps and changes leave
// via onChange, recorded and applied by the gallery host.

import type { GalleryModule } from "../../types.ts";
import { TouchSeedSourceRenderer } from "../../touchSeedSource/TouchSeedSourcePanel.tsx";

export const definition = {
  id: "touchSeedSource",
  type: "notice" as const,
  prompt: "Where should the touch layout start from?",
  audit_label: "Touch seed source",
};

/** The touch-seed-source decision value (data-model.md). */
export type TouchSeedSourceValue = "import-adapt" | "reseed-from-desktop";

const touchSeedSource: GalleryModule<TouchSeedSourceValue> = {
  definition,
  provides: ["touch-seed-source"],
  screen: "touch_seed_source",
  requires: ["physical-layout"],
  inputs: [],
  // decisionIRPaths maps this decision to [] today; a story that gives the
  // module real IR writes updates decisionIRPaths in the same change
  // (decisionIRConsistency.test.ts pins the two together).
  writes: [],
  apply: () => ({}),
  renderer: TouchSeedSourceRenderer,
  fixtures: {
    valid: [{ value: undefined, note: "no decision recorded yet" }],
    invalid: [],
  },
};

export default touchSeedSource;

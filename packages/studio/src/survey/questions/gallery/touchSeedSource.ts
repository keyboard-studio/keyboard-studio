// touchSeedSource — gallery decision module for `touch-seed-source` (spec 090).
//
// Migrated in T012 (US1): the renderer is the touch seed fork chooser
// (survey/touchSeedSource/TouchSeedSourcePanel.tsx), hosted by
// TouchSeedSourceHost. The step's asked-while-unrecorded gating is
// preserved where it lives — the `touch_seed_source` declaration's
// `gatedBy` in steps/stepDependencies.ts (landed by 088) — not on the
// module. The decision has no working-copy effect of its own (the touch
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

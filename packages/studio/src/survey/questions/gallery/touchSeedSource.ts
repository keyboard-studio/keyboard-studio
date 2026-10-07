// touchSeedSource — gallery decision module for `touch-seed-source` (spec 090).
//
// Stub landed with T008 so the FR-002 coverage test pins this decision's
// provider from the start; the real renderer/apply fill in with T012 (US1).
// The value is the author's seed choice for the touch layout; the step
// is asked only while no choice is recorded (stepDependencies gatedBy,
// landed by 088).
// Boundary (FR-003): a gallery module is a pure descriptor — no store
// imports; the value arrives via DecisionRendererProps and changes leave
// via onChange, recorded and applied by the gallery host.

import type { GalleryModule } from "../../types.ts";
import { UnmigratedGalleryRenderer } from "./placeholderRenderer.tsx";

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
  renderer: UnmigratedGalleryRenderer,
  fixtures: {
    valid: [{ value: undefined, note: "no decision recorded yet" }],
    invalid: [],
  },
};

export default touchSeedSource;

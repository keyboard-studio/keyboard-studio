// windowsLayout — gallery decision module for `windows-layout` (spec 090).
//
// Migrated in T011 (US1): the renderer is the layout step's picker
// (survey/layout/LayoutStep.tsx), hosted by LayoutStepHost; readers in
// lib/layoutFamily.ts resolve the pick from this decision. The decision
// has no working-copy effect — its `apply` is deliberately empty and the
// recorded decision itself is the effect (carve, the rules demo, and the
// mechanism gallery read it back through layoutFamily's selectors).
// Boundary (FR-003): a gallery module is a pure descriptor — no store
// imports; the value arrives via DecisionRendererProps and changes leave
// via onChange, recorded and applied by the gallery host.

import type { GalleryModule } from "../../types.ts";
import { WindowsLayoutRenderer } from "../../layout/LayoutStep.tsx";

export const definition = {
  id: "windowsLayout",
  type: "notice" as const,
  prompt: "Which keyboard layout do your typists use?",
  audit_label: "Windows layout",
};

/** The windows-layout decision value (data-model.md). */
export interface WindowsLayoutValue {
  layoutId: string;
  origin: "proposed" | "confirmed" | "overturned";
}

const windowsLayout: GalleryModule<WindowsLayoutValue> = {
  definition,
  provides: ["windows-layout"],
  requires: ["language-code"],
  inputs: [],
  // decisionIRPaths maps this decision to [] today; a story that gives the
  // module real IR writes updates decisionIRPaths in the same change
  // (decisionIRConsistency.test.ts pins the two together).
  writes: [],
  apply: () => ({}),
  renderer: WindowsLayoutRenderer,
  fixtures: {
    valid: [{ value: undefined, note: "no decision recorded yet" }],
    invalid: [],
  },
};

export default windowsLayout;

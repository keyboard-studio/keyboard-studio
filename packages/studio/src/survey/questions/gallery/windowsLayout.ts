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
import {
  WindowsLayoutRenderer,
  type WindowsLayoutValue,
} from "../../layout/LayoutStep.tsx";

export const definition = {
  id: "windowsLayout",
  type: "notice" as const,
  prompt: "Which keyboard layout do your typists use?",
  audit_label: "Windows layout",
};

// The windows-layout decision value type (data-model.md) is declared with
// the renderer in survey/layout/LayoutStep.tsx and re-exported for module
// consumers (D-090-8: declaring it here would close a module↔renderer
// import cycle — the module already imports the renderer from there).
export type { WindowsLayoutValue };

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

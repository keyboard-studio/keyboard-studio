// windowsLayout — gallery decision module for `windows-layout` (spec 090).
//
// Stub landed with T008 so the FR-002 coverage test pins this decision's
// provider from the start; the real renderer/apply fill in with T011 (US1).
// The value is the author's confirmed community layout pick; readers in
// lib/layoutFamily.ts resolve it from the decision once T011 lands.
// Boundary (FR-003): a gallery module is a pure descriptor — no store
// imports; the value arrives via DecisionRendererProps and changes leave
// via onChange, recorded and applied by the gallery host.

import type { GalleryModule } from "../../types.ts";
import { UnmigratedGalleryRenderer } from "./placeholderRenderer.tsx";

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
  renderer: UnmigratedGalleryRenderer,
  fixtures: {
    valid: [{ value: undefined, note: "no decision recorded yet" }],
    invalid: [],
  },
};

export default windowsLayout;

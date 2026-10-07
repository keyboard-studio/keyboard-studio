// physicalLayout — gallery decision module for `physical-layout` (spec 090).
//
// Stub landed with T008 so the FR-002 coverage test pins this decision's
// provider from the start; the real renderer/apply fill in with T041 (US4).
// The value is the physical key assignments; its apply performs the R1
// lockDesktop effect. T041 retires the reducer's R1 hook.
// Boundary (FR-003): a gallery module is a pure descriptor — no store
// imports; the value arrives via DecisionRendererProps and changes leave
// via onChange, recorded and applied by the gallery host.

import type { GalleryModule } from "../../types.ts";
import { UnmigratedGalleryRenderer } from "./placeholderRenderer.tsx";

export const definition = {
  id: "physicalLayout",
  type: "notice" as const,
  prompt: "Where does each character go on the physical keyboard?",
  audit_label: "Physical layout",
};

/**
 * The physical-layout decision value (data-model.md): the author's key
 * assignments, keyed by physical key id. T041 pins the assignment
 * payload from the mechanism gallery's own record shape.
 */
export interface PhysicalLayoutValue {
  assignments: Readonly<Record<string, string>>;
}

const physicalLayout: GalleryModule<PhysicalLayoutValue> = {
  definition,
  provides: ["physical-layout"],
  requires: ["carved-layout", "deadkeys-defined", "rule-set", "marks-treatment", "windows-layout"],
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

export default physicalLayout;

// helpDocs — gallery decision module for `help-docs` (spec 090).
//
// Stub landed with T008 so the FR-002 coverage test pins this decision's
// provider from the start; the real renderer/apply fill in with T052 (US5).
// 090 registers the gallery host + decision-log entry for this module
// only; its value and applies are owned by 089 (research Q3).
// Boundary (FR-003): a gallery module is a pure descriptor — no store
// imports; the value arrives via DecisionRendererProps and changes leave
// via onChange, recorded and applied by the gallery host.

import type { GalleryModule } from "../../types.ts";
import { UnmigratedGalleryRenderer } from "./placeholderRenderer.tsx";

export const definition = {
  id: "helpDocs",
  type: "notice" as const,
  prompt: "What should the help pages say?",
  audit_label: "Help docs",
};

/**
 * The help-docs decision value: the Phase F help/welcome answers as one
 * composite. Owned by 089 (research Q3) — 090 hosts the module and logs
 * the decision (T052); the shape is not redefined here.
 */
export interface HelpDocsValue {
  answers: Readonly<Record<string, string | string[] | undefined>>;
}

const helpDocs: GalleryModule<HelpDocsValue> = {
  definition,
  provides: ["help-docs"],
  screen: "help",
  requires: ["physical-layout", "touch-layout"],
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

export default helpDocs;

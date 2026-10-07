// baseKeyboard — gallery decision module for `base-keyboard` (spec 090).
//
// Stub landed with T008 so the FR-002 coverage test pins this decision's
// provider from the start; the real renderer/apply fill in with T013 (US1).
// The value is the chosen base keyboard's catalog identity; its apply is
// an IR no-op in 090 (instantiation setup stays in StudioShell, research
// R3, and reads the recorded decision once T013 lands).
// Boundary (FR-003): a gallery module is a pure descriptor — no store
// imports; the value arrives via DecisionRendererProps and changes leave
// via onChange, recorded and applied by the gallery host.

import type { GalleryModule } from "../../types.ts";
import { UnmigratedGalleryRenderer } from "./placeholderRenderer.tsx";

export const definition = {
  id: "baseKeyboard",
  type: "notice" as const,
  prompt: "Which existing keyboard should yours start from?",
  audit_label: "Base keyboard",
};

/** The base-keyboard decision value: the catalog record's identity. */
export interface BaseKeyboardValue {
  id: string;
  name: string;
}

const baseKeyboard: GalleryModule<BaseKeyboardValue> = {
  definition,
  provides: ["base-keyboard"],
  requires: ["language-code", "target-script"],
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

export default baseKeyboard;

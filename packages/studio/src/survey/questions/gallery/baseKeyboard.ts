// baseKeyboard — gallery decision module for `base-keyboard` (spec 090).
//
// The value is the chosen base keyboard's catalog identity. Its apply is
// an IR no-op in 090: instantiation setup stays in StudioShell (research
// R3), whose single-instantiation effect reads this recorded decision
// since T013 (the session `baseConfirmed` flag is retired as the trigger).
// Renderer: `survey/chooseBase/BaseKeyboardRenderer.tsx` — the
// BaseResolution picker hosted; its confirm runs the F1 rebase gate and
// then records through the gallery host's onChange.
// Boundary (FR-003): a gallery module is a pure descriptor — no store
// imports; the value arrives via DecisionRendererProps and changes leave
// via onChange, recorded and applied by the gallery host.

import type { GalleryModule } from "../../types.ts";
import { BaseKeyboardRenderer } from "../../chooseBase/BaseKeyboardRenderer.tsx";

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
  renderer: BaseKeyboardRenderer,
  fixtures: {
    valid: [{ value: undefined, note: "no decision recorded yet" }],
    invalid: [],
  },
};

export default baseKeyboard;

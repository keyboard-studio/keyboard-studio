// baseKeyboard — gallery decision module for `base-keyboard` (spec 090).
//
// This file's name and the module's `id` deliberately keep the pre-#1810
// name: the id is a persisted question/decision identifier (draft migration
// resolves answers through it), and the registry contract pins
// `definition.id` to the filename. The code identifiers around it were
// renamed to the glossary terms (`StartKeyboard`, `startKeyboard`).
//
// The value is the chosen starting keyboard's catalog identity. Its apply is
// an IR no-op in 090: instantiation setup stays in StudioShell (research
// R3), whose single-instantiation effect reads this recorded decision
// since T013 (the session `startConfirmed` flag is retired as the trigger).
// Renderer: `survey/chooseStart/StartKeyboardRenderer.tsx` — the
// StartResolution picker hosted; its confirm runs the F1 rebase gate and
// then records through the gallery host's onChange.
// Boundary (FR-003): a gallery module is a pure descriptor — no store
// imports; the value arrives via DecisionRendererProps and changes leave
// via onChange, recorded and applied by the gallery host.

import type { GalleryModule } from "../../types.ts";
import {
  StartKeyboardRenderer,
  type StartKeyboardValue,
} from "../../chooseStart/StartKeyboardRenderer.tsx";

export const definition = {
  id: "baseKeyboard",
  type: "notice" as const,
  prompt: "Which existing keyboard should yours start from?",
  audit_label: "Starting keyboard",
};

// The base-keyboard decision value type is declared with the renderer in
// survey/chooseStart/StartKeyboardRenderer.tsx and re-exported for module
// consumers (D-090-8).
export type { StartKeyboardValue };

const startKeyboard: GalleryModule<StartKeyboardValue> = {
  definition,
  provides: ["base-keyboard"],
  screen: "choose_base",
  requires: ["language-code", "target-script"],
  inputs: [],
  // decisionIRPaths maps this decision to [] today; a story that gives the
  // module real IR writes updates decisionIRPaths in the same change
  // (decisionIRConsistency.test.ts pins the two together).
  writes: [],
  apply: () => ({}),
  renderer: StartKeyboardRenderer,
  fixtures: {
    valid: [{ value: undefined, note: "no decision recorded yet" }],
    invalid: [],
  },
};

export default startKeyboard;

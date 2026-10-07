// deadkeysDefined — gallery decision module for `deadkeys-defined` (spec 090).
//
// Stub landed with T008 so the FR-002 coverage test pins this decision's
// provider from the start; the real renderer/apply fill in with T033 (US3).
// The value is the list of deadkey operations; its apply replays them
// through the deadkey write path. The op type is re-homed to an
// importable layer by T033 (today it lives in editors/, which gallery
// modules may not import).
// Boundary (FR-003): a gallery module is a pure descriptor — no store
// imports; the value arrives via DecisionRendererProps and changes leave
// via onChange, recorded and applied by the gallery host.

import type { GalleryModule } from "../../types.ts";
import { UnmigratedGalleryRenderer } from "./placeholderRenderer.tsx";

export const definition = {
  id: "deadkeysDefined",
  type: "notice" as const,
  prompt: "Which deadkeys does your keyboard define?",
  audit_label: "Deadkeys defined",
};

/**
 * The deadkeys-defined decision value (data-model.md): the deadkey
 * operations, replayed in order by the module's apply. Op payloads are
 * the deadkey editor's serializable operations; their precise type is
 * pinned by T033.
 */
export interface DeadkeysDefinedValue {
  ops: readonly unknown[];
}

const deadkeysDefined: GalleryModule<DeadkeysDefinedValue> = {
  definition,
  provides: ["deadkeys-defined"],
  screen: "deadkeys",
  requires: ["carved-layout"],
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

export default deadkeysDefined;

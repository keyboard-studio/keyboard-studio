// touchLayout — gallery decision module for `touch-layout` (spec 090).
//
// Stub landed with T008 so the FR-002 coverage test pins this decision's
// provider from the start; the real renderer/apply fill in with T042 (US4).
// The value is the touch edit operations plus the deleted touch key
// ids; per-key provenance keeps spec 014's vocabulary. The touch draft /
// JSON the UI edits is the applied view, not the value. T042 retires
// the reducer's R2 hook.
// Boundary (FR-003): a gallery module is a pure descriptor — no store
// imports; the value arrives via DecisionRendererProps and changes leave
// via onChange, recorded and applied by the gallery host.

import type { GalleryModule } from "../../types.ts";
import { UnmigratedGalleryRenderer } from "./placeholderRenderer.tsx";

export const definition = {
  id: "touchLayout",
  type: "notice" as const,
  prompt: "How should the touch layout look?",
  audit_label: "Touch layout",
};

/**
 * The touch-layout decision value (data-model.md): the author's touch
 * edit operations in order, plus the touch keys they deleted. Op
 * payloads are spec 014's serializable key-edit operations; their
 * precise type is pinned by T042.
 */
export interface TouchLayoutValue {
  ops: readonly unknown[];
  deletedTouchKeyIds: readonly string[];
}

const touchLayout: GalleryModule<TouchLayoutValue> = {
  definition,
  provides: ["touch-layout"],
  screen: "touch",
  requires: ["physical-layout", "touch-seed-source"],
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

export default touchLayout;

// invisiblesInventory — gallery decision module for `invisibles-inventory` (spec 090).
//
// Stub landed with T008 so the FR-002 coverage test pins this decision's
// provider from the start; the real renderer/apply fill in with T022 (US2).
// Accepted/declined invisible (format) characters proposed from the
// confirmed alphabet.
// Boundary (FR-003): a gallery module is a pure descriptor — no store
// imports; the value arrives via DecisionRendererProps and changes leave
// via onChange, recorded and applied by the gallery host.

import type { GalleryModule } from "../../types.ts";
import { UnmigratedGalleryRenderer } from "./placeholderRenderer.tsx";

export const definition = {
  id: "invisiblesInventory",
  type: "notice" as const,
  prompt: "Which invisible characters does your keyboard need?",
  audit_label: "Invisibles inventory",
};

import type { DecisionProvenance } from "../../../decisions/decisionTypes.ts";

/** One inventory item with its per-item provenance (FR-006). */
export interface InventoryItem {
  char: string;
  provenance: DecisionProvenance;
}

/**
 * The inventory decision value (data-model.md): what the author accepted
 * and what they declined, each item carrying its own provenance.
 */
export interface InventoryDecisionValue {
  accepted: InventoryItem[];
  declined: InventoryItem[];
}

const invisiblesInventory: GalleryModule<InventoryDecisionValue> = {
  definition,
  provides: ["invisibles-inventory"],
  requires: ["character-inventory"],
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

export default invisiblesInventory;

// invisiblesInventory — gallery decision module for `invisibles-inventory`
// (spec 090).
//
// The value is an InventoryDecisionValue (accepted/declined with per-item
// provenance, FR-006), declared with the shared draft ops in
// survey/phaseBDraftOps.ts and re-exported here for module consumers.
// Items are keyed by `U+XXXX` notation — the notation IS the char identity
// for format characters, which have no glyph (see phaseBDraftOps).
//
// The InvisiblesStep's toggles are draft ops over the shared accumulator
// (survey/useInventoryDraft.ts), recorded through the gallery host's
// decide core under the editing step's attribution. Renderer:
// `survey/invisibles/InvisiblesStep.tsx`, hosted.

import type { GalleryModule } from "../../types.ts";
import type { InventoryDecisionValue } from "../../phaseBDraftOps.ts";
import { InvisiblesStep } from "../../invisibles/InvisiblesStep.tsx";

export const definition = {
  id: "invisiblesInventory",
  type: "notice" as const,
  prompt: "Which invisible characters does your keyboard need?",
  audit_label: "Invisibles inventory",
};

export type { InventoryDecisionValue, InventoryItem } from "../../phaseBDraftOps.ts";

const invisiblesInventory: GalleryModule<InventoryDecisionValue> = {
  definition,
  provides: ["invisibles-inventory"],
  screen: "invisibles",
  requires: ["character-inventory"],
  inputs: [],
  // decisionIRPaths maps this decision to [] today; a story that gives the
  // module real IR writes updates decisionIRPaths in the same change
  // (decisionIRConsistency.test.ts pins the two together).
  writes: [],
  apply: () => ({}),
  renderer: InvisiblesStep,
  fixtures: {
    valid: [{ value: undefined, note: "no decision recorded yet" }],
    invalid: [],
  },
};

export default invisiblesInventory;

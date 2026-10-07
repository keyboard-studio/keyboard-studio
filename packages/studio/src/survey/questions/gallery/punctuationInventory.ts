// punctuationInventory — gallery decision module for `punctuation-inventory`
// (spec 090).
//
// The value is an InventoryDecisionValue (accepted/declined with per-item
// provenance, FR-006), declared with the shared draft ops in
// survey/phaseBDraftOps.ts and re-exported here for module consumers.
//
// The value is maintained as a PROJECTION of the character-inventory
// value (research D-090-10(d)): the PunctuationStep's edits are draft ops
// over the shared accumulator (survey/useInventoryDraft.ts), and the hook
// re-records this value from the character value after each mutation —
// accepted = the draft's punctuation category, declined = the
// rejected-punctuation ledger with the provenance captured at removal.
// Renderer: `survey/punctuation/PunctuationStep.tsx`, hosted.

import type { GalleryModule } from "../../types.ts";
import type { InventoryDecisionValue } from "../../phaseBDraftOps.ts";
import { PunctuationStep } from "../../punctuation/PunctuationStep.tsx";

export const definition = {
  id: "punctuationInventory",
  type: "notice" as const,
  prompt: "Which punctuation does your keyboard need?",
  audit_label: "Punctuation inventory",
};

export type { InventoryDecisionValue, InventoryItem } from "../../phaseBDraftOps.ts";

const punctuationInventory: GalleryModule<InventoryDecisionValue> = {
  definition,
  provides: ["punctuation-inventory"],
  requires: ["character-inventory"],
  inputs: [],
  // decisionIRPaths maps this decision to [] today; a story that gives the
  // module real IR writes updates decisionIRPaths in the same change
  // (decisionIRConsistency.test.ts pins the two together).
  writes: [],
  apply: () => ({}),
  renderer: PunctuationStep,
  fixtures: {
    valid: [{ value: undefined, note: "no decision recorded yet" }],
    invalid: [],
  },
};

export default punctuationInventory;

// characterInventory — gallery decision module for `character-inventory` (spec 090).
//
// Stub landed with T008 so the FR-002 coverage test pins this decision's
// provider from the start; the real renderer/apply fill in with T021 (US2).
// The value maps field-for-field from the Phase B draft's characters
// slice; T021 folds the pb_character_inventory spike into this module
// and T025 retires phaseBDraftStore.
// Boundary (FR-003): a gallery module is a pure descriptor — no store
// imports; the value arrives via DecisionRendererProps and changes leave
// via onChange, recorded and applied by the gallery host.

import type { GalleryModule } from "../../types.ts";
import { UnmigratedGalleryRenderer } from "./placeholderRenderer.tsx";

export const definition = {
  id: "characterInventory",
  type: "notice" as const,
  prompt: "Which characters does your keyboard need to type?",
  audit_label: "Character inventory",
};

import type { AttestedStack, DeclaredRole } from "@keyboard-studio/contracts";
import type { SourcedInventory } from "@keyboard-studio/engine";

/**
 * Per-character provenance inside the inventory value: the draft slice's
 * DraftProvenance union (stores/phaseBDraftStore.ts), reconstructed here
 * from its definition — proposal sources unioned with the author/text/
 * base markers — since gallery modules may not import stores/.
 */
export type CharacterInventoryProvenance =
  | SourcedInventory["source"]
  | "author"
  | "text"
  | "base"
  | "ascii-floor";

/**
 * The character-inventory decision value: the confirmed alphabet, mapped
 * field-for-field from the Phase B draft characters slice (data-model.md).
 * `provenance` is keyed by NFC grapheme, as in the draft slice.
 */
export interface CharacterInventoryValue {
  chars: string[];
  bases: string[];
  marks: string[];
  attestedStacks: AttestedStack[];
  declaredRoles: Record<string, DeclaredRole>;
  numbers: string[];
  punctuation: string[];
  symbols: string[];
  separators: string[];
  controls: string[];
  provenance: Record<string, CharacterInventoryProvenance>;
}

const characterInventory: GalleryModule<CharacterInventoryValue> = {
  definition,
  provides: ["character-inventory"],
  requires: ["target-script", "authoring-track", "project-keyboard-id"],
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

export default characterInventory;

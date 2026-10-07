// characterInventory — gallery decision module for `character-inventory` (spec 090).
//
// The confirmed alphabet plus the Phase B accept/decline state, as one
// decision value (data-model.md; field-for-field mapping from the old
// PhaseBDraftState recorded in research D-090-10(c)). The pure draft
// ops live in survey/phaseBDraftOps.ts; the shared editing surface is
// survey/useInventoryDraft.ts. Renderer: `survey/CharactersStep.tsx`
// (the existing step component, hosted — look unchanged).
//
// The retired `pb_character_inventory` spike (research R2) is folded in
// here: its `extract` — the starting-point produced-set probe — is this
// module's `extract`, lifted to produce a whole seed value. Live
// extraction is 092's work; nothing runs this extract in the live app
// in 090.
//
// Boundary (FR-003): a gallery module is a pure descriptor — no store
// imports; the value arrives via DecisionRendererProps and changes leave
// via onChange, recorded and applied by the gallery host.

import { buildProducedSet } from "@keyboard-studio/contracts";
import type { GalleryModule } from "../../types.ts";
import type { ExtractContext } from "../../../decisions/extractContext.ts";
import { valueFromProducedSet, type CharacterInventoryValue } from "../../phaseBDraftOps.ts";
import { CharactersStep } from "../../CharactersStep.tsx";

export const definition = {
  id: "characterInventory",
  type: "notice" as const,
  prompt: "Which characters does your keyboard need to type?",
  audit_label: "Character inventory",
};

// The value type is declared with the shared draft ops in
// survey/phaseBDraftOps.ts (four renderers share it — the D-090-8
// pattern, with the ops module as the renderer-side home) and re-exported
// here for module consumers.
export type { CharacterInventoryValue };

/**
 * Starting-point probe (the spike's `extractCharacterInventory`,
 * folded in): the characters the base keyboard can already produce,
 * as a seed character-inventory value whose picks all carry `base`
 * provenance. Undefined when the IR yields no produced characters.
 */
export function extractCharacterInventory(
  ctx: ExtractContext,
): CharacterInventoryValue | undefined {
  const ir = ctx.ir;
  if (ir === null) return undefined;
  return valueFromProducedSet(buildProducedSet(ir));
}

const characterInventory: GalleryModule<CharacterInventoryValue> = {
  definition,
  provides: ["character-inventory"],
  screen: "characters",
  // The characters step's declared requires, now declared HERE (spec 091):
  // the FR-002 coverage test pins module.requires EQUAL to the baseline
  // step requires (the 091 parity).
  // Subset decision flows that include this module must therefore also
  // include the providers of these three (track_choice,
  // project_keyboard_id, il_target_script).
  requires: ["target-script", "authoring-track", "project-keyboard-id"],
  inputs: [],
  // decisionIRPaths maps this decision to [] today; a story that gives the
  // module real IR writes updates decisionIRPaths in the same change
  // (decisionIRConsistency.test.ts pins the two together).
  writes: [],
  apply: () => ({}),
  renderer: CharactersStep,
  extract: extractCharacterInventory,
  fixtures: {
    valid: [{ value: undefined, note: "no decision recorded yet" }],
    invalid: [],
  },
};

export default characterInventory;

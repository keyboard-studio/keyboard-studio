// Per-question module: pb_character_inventory (Phase B) — DECISION SPIKE slice.
//
// One slice of the Phase B character inventory re-expressed as a plain
// question module with a custom renderer (km/decisions-spike). The module
// itself is uniform with every other question module (definition, validate,
// fixtures, inputs/writes) so the shared questionModuleContract suite covers
// it automatically; the bulk lives in the renderer component
// (survey/characters/InventoryRenderer.tsx). Nothing here duplicates PhaseB —
// the inventory the studio already builds stays where it is; this proves the
// module system can host a gallery-scale unit.
//
// Spike scope: `writes` is empty and `mutate` is absent (display-only per
// FR-007) — the IR write seam for the inventory is a later phase, not this
// spike.

import type { QuestionModule, ValidationResult } from "../../types.ts";
import { irPath } from "@keyboard-studio/contracts";
import { InventoryRenderer } from "../../characters/InventoryRenderer.tsx";

export const definition = {
  id: "pb_character_inventory",
  prompt: "Which characters does your keyboard need to type?",
  audit_label: "Character inventory",
  help_text:
    "Add every character your language needs — letters, marks, and " +
    "punctuation. Type a character directly or paste U+XXXX notation.",
  type: "multi_select" as const,
  required: true,
  // No `next`: terminal in the spike slice. In the decision model, routing is
  // derived from requires/provides, not declared per module.
} satisfies import("../../types.ts").FlowQuestion;

export function validate(
  value: string | string[] | undefined,
): ValidationResult {
  const chars = Array.isArray(value) ? value : [];
  if (chars.length === 0) {
    return {
      ok: false,
      code: "required",
      message: "Add at least one character to the inventory.",
    };
  }
  for (const ch of chars) {
    if (typeof ch !== "string" || Array.from(ch).length !== 1) {
      return {
        ok: false,
        code: "invalid_char",
        message: "Each inventory entry must be a single character.",
      };
    }
  }
  return { ok: true };
}

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: ["a", "b", "é"], note: "basic inventory" },
    { value: ["ŋ"], note: "single special letter" },
  ],
  invalid: [
    { value: [], expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
    { value: ["ab"], expectedCode: "invalid_char", note: "multi-char string rejected" },
  ],
};

const mod: QuestionModule = {
  definition,
  validate,
  fixtures,
  inputs: [irPath("header", "bcp47")],
  writes: [],
  // Decision spike (km/decisions-spike).
  provides: "character-inventory",
  requires: ["target-script"],
  renderer: InventoryRenderer,
};
export default mod;

// Per-question module: pb_special_letters_notes (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pb_special_letters_notes",
  prompt: "Any notes about these special letters? (optional)",
  help_text:
    "For example: which letters have capital forms, which sounds they " +
    "represent, or any uncertainty you have about whether a letter belongs " +
    "in the inventory. Leave blank if there is nothing to add.",
  type: "text" as const,
  required: false,
  next: "pb_latin_digraphs_gate",
} satisfies import("../../types.ts").FlowQuestion;

// No validation: required: false; free-text notes.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "ŋ represents the ng sound", note: "typical note" },
    { value: "", note: "blank is fine (optional)" },
    { value: undefined, note: "undefined is fine (optional)" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

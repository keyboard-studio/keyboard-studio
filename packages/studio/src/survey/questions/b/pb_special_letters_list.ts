// Per-question module: pb_special_letters_list (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pb_special_letters_list",
  prompt:
    "List the special letters your language uses (type them or use the character picker).",
  help_text:
    "Type each letter and its capital form if it has one, separated by spaces. " +
    "For example: ŋ Ŋ ɛ Ɛ ɔ Ɔ ə Ə. If you cannot type a letter, use the " +
    "visual character picker (the grid icon next to this field) -- it is " +
    "seeded with common letters for your language. The picker and this text " +
    "field both feed the same confirmed list. Leave a note in the comments " +
    "below if you are unsure about a specific letter.",
  type: "text" as const,
  required: false,
  next: "pb_special_letters_notes",
} satisfies import("../../types.ts").FlowQuestion;

// No validation: required: false; free-text character entry.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "ŋ Ŋ ɛ Ɛ ɔ Ɔ", note: "typical African extended-Latin letters" },
    { value: "", note: "blank is fine (not required)" },
    { value: undefined, note: "undefined is fine (not required)" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

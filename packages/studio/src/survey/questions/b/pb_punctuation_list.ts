// Per-question module: pb_punctuation_list (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pb_punctuation_list",
  prompt: "Describe or list the punctuation marks your language needs.",
  help_text:
    "Type or paste the punctuation marks, or describe them in words if you " +
    "cannot type them. For example: special opening and closing quotation " +
    "marks, a glottal-stop sign, or a word-separator dot. Include any marks " +
    "that stand in for spaces between words or sentences.",
  type: "text" as const,
  required: false,
  next: "pb_digit_set",
} satisfies import("../../types.ts").FlowQuestion;

// No validation: required: false; free-text description.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "« » special quotation marks", note: "French-style quotes" },
    { value: "· middle dot word separator", note: "Catalan middle dot" },
    { value: "", note: "blank is fine (not required)" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

// Per-question module: pb_rtl_special_letters (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pb_rtl_special_letters",
  prompt:
    "Does your language use any letters or letter combinations that are specific to your language and not shared with other languages using the same script?",
  help_text:
    "For example, Urdu uses some letter forms that are specific to Urdu and " +
    "are not used in Arabic. Persian has four letters not in Arabic. Some " +
    "languages also require certain combinations of letters to be displayed " +
    "as a single joined shape (a ligature). List any language-specific " +
    "letters or required ligatures here, or leave blank if there are none.",
  type: "text" as const,
  required: false,
  // enter the shared universal tail (special letters, punctuation, digits, count)
  next: "pb_special_letters",
} satisfies import("../../types.ts").FlowQuestion;

// No validation: required: false; free-text.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "ڑ ڈ ں ٹ", note: "Urdu-specific letters" },
    { value: "", note: "blank is fine (optional)" },
    { value: undefined, note: "undefined is fine (optional)" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

// Per-question module: pb_syllabic_finals_detail (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pb_syllabic_finals_detail",
  prompt:
    "Describe or paste the final-consonant marks or small raised forms your writing system uses.",
  help_text:
    "Type or paste the marks if you can, or describe them in words (for " +
    "example, 'a small raised dot in the center' or 'a small raised " +
    "version of the plain consonant character'). If there are several -- " +
    "one per consonant -- list as many as you can. The visual character " +
    "picker is also available. The studio will use this to decide whether " +
    "these marks need their own key or can be typed through a modifier " +
    "key.",
  type: "text" as const,
  required: false,
  // enter the shared universal tail (special letters, punctuation, digits, count)
  next: "pb_special_letters",
} satisfies import("../../types.ts").FlowQuestion;

// No validation: required: false; free-text.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    {
      value: "ᐦ ᑊ ᐟ",
      note: "UCAS final consonant marks",
    },
    { value: "small raised dot in center", note: "text description" },
    { value: "", note: "blank is fine (optional)" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

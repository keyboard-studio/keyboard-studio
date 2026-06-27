// Per-question module: pb_indic_virama (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pb_indic_virama",
  prompt:
    "What is the sign in your script called that removes the inherent vowel from a consonant and can trigger consonant joining?",
  help_text:
    "Most South Asian scripts have a small sign that is placed after a " +
    "consonant to show that the consonant has no vowel following it. In " +
    "Hindi (Devanagari) it looks like a small slanted line under the letter. " +
    "It is also what causes two consonants to join into a combined shape. " +
    "Type the name your community uses for it, or leave blank if you do not " +
    "know the name.",
  type: "text" as const,
  required: false,
  next: "pb_indic_vowels_separate",
} satisfies import("../../types.ts").FlowQuestion;

// No validation: required: false; informational text entry.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "virama", note: "generic name" },
    { value: "halant", note: "Hindi term" },
    { value: "", note: "blank is fine (optional)" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

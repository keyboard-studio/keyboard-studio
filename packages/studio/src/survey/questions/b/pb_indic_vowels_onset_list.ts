// Per-question module: pb_indic_vowels_onset_list (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pb_indic_vowels_onset_list",
  prompt:
    "List the full standing vowel letters your script uses at the start of a word or syllable.",
  help_text:
    "These are the forms your script uses when a vowel begins a word -- " +
    "the independent shapes, not the small marks attached to consonants. " +
    "Type or paste them, or use the character picker. For example, " +
    "Devanagari has independent vowel letters for a, aa, i, ii, u, uu, " +
    "e, ai, o, au, and others.",
  type: "text" as const,
  required: false,
  // enter the shared universal tail (special letters, punctuation, digits, count)
  next: "pb_special_letters",
} satisfies import("../../types.ts").FlowQuestion;

// No validation: required: false; free-text character list.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "अ आ इ ई उ ऊ ए ऐ ओ औ", note: "Devanagari independent vowels" },
    { value: "", note: "blank is fine (optional)" },
    { value: undefined, note: "undefined is fine (optional)" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

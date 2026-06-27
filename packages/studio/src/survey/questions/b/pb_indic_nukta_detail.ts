// Per-question module: pb_indic_nukta_detail (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pb_indic_nukta_detail",
  prompt:
    "Which consonant letters in your script take the dot-below modifier?",
  help_text:
    "Type or paste the base letters that can have the dot placed beneath " +
    "them, for example the letters used for k, kh, g, j, ph, and f in " +
    "Devanagari Hindi. If you are not sure of the exact set, type the " +
    "ones you know and leave a note. The visual character picker is also " +
    "available.",
  type: "text" as const,
  required: false,
  next: "pb_indic_vowels_onset",
} satisfies import("../../types.ts").FlowQuestion;

// No validation: required: false; free-text character list.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "क़ ख़ ग़ ज़ फ़", note: "Devanagari nukta letters for Urdu/Persian sounds" },
    { value: "", note: "blank is fine (optional)" },
    { value: undefined, note: "undefined is fine (optional)" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

// Per-question module: pb_indic_vowels_separate (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.

import type { QuestionModule } from "../../types.ts";
import { makeRequiredOptionValidator } from "../validators.ts";

export const definition = {
  id: "pb_indic_vowels_separate",
  prompt:
    "In your script, are vowels written as separate signs placed on or near the consonant, or are they shown as full letters?",
  help_text:
    "In many South Asian scripts, vowels are shown as small marks attached " +
    "to a consonant rather than as full standing letters. For example, the " +
    "vowel 'i' might appear as a small mark placed to the left or right of a " +
    "consonant. The keyboard needs to know whether your vowels work this way.",
  type: "radio" as const,
  required: true,
  options: [
    {
      value: "attached-marks",
      label: "Vowels are small signs attached to consonants (the usual Indic pattern)",
    },
    {
      value: "full-letters",
      label: "Vowels are full standing letters, not attached marks",
    },
    {
      value: "mixed",
      label: "Some vowels are attached marks and some are full letters",
    },
  ],
  next: "pb_indic_pre_base_vowels",
} satisfies import("../../types.ts").FlowQuestion;


export const validate = makeRequiredOptionValidator(definition.options.map((o) => o.value), "Please choose how vowels are written in your script.", (v) => `"${v}" is not a valid choice.`);

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "attached-marks", note: "vowel marks (usual Indic)" },
    { value: "full-letters", note: "standalone vowel letters" },
    { value: "mixed", note: "both forms" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
    { value: "signs", expectedCode: "invalid_option" },
  ],
};


const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [], provides: ["indic-vowels-separate"], requires: ["non-roman-branch"] };
export default mod;

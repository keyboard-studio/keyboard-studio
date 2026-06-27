// Per-question module: pb_indic_vowels_separate (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.

import type { QuestionModule, ValidationResult } from "../../types.ts";

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

const VALID_VALUES = new Set(["attached-marks", "full-letters", "mixed"]);

export function validate(
  value: string | string[] | undefined,
): ValidationResult {
  const v = typeof value === "string" ? value : "";
  if (!v) {
    return {
      ok: false,
      code: "required",
      message: "Please choose how vowels are written in your script.",
    };
  }
  if (!VALID_VALUES.has(v)) {
    return {
      ok: false,
      code: "invalid_option",
      message: `"${v}" is not a valid choice.`,
    };
  }
  return { ok: true };
}

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


const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;

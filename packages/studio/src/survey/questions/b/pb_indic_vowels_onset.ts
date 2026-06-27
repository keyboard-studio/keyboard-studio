// Per-question module: pb_indic_vowels_onset (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "pb_indic_vowels_onset",
  prompt:
    "When a vowel sound begins a word or syllable with no consonant before it, does your script write it as a full standing letter -- different from the small mark used when the vowel follows a consonant?",
  help_text:
    "In most South Asian scripts, the same vowel sound is written two " +
    "different ways: as a full standing letter when it starts a word, " +
    "but as a small attached mark when it follows a consonant. The " +
    "keyboard needs both forms. Answer Yes if your script works this " +
    "way.",
  type: "bool" as const,
  required: true,
  next: [
    { condition: "value == 'true'", goto: "pb_indic_vowels_onset_list" },
    { default: true, goto: "pb_special_letters" },
  ],
} satisfies import("../../types.ts").FlowQuestion;

export function validate(
  value: string | string[] | undefined,
): ValidationResult {
  const v = typeof value === "string" ? value : "";
  if (v !== "true" && v !== "false") {
    return {
      ok: false,
      code: "required",
      message: "Please answer Yes or No.",
    };
  }
  return { ok: true };
}

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "true", note: "independent vowel letters present" },
    { value: "false", note: "no independent vowel forms" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
  ],
};


const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;

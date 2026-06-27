// Per-question module: pb_indic_conjuncts (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.
// A2a pre-signal (cluster sensitivity).

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "pb_indic_conjuncts",
  prompt:
    "Does your script join two consonants together into a combined shape when there is no vowel between them?",
  help_text:
    "In many South Asian scripts, when two consonants appear next to each " +
    "other without a vowel between them, the writing system joins them into " +
    "a special combined shape. For example, in Devanagari the letters k and " +
    "sh can combine into a single two-part shape. The keyboard needs a special " +
    "sign that removes the built-in vowel from a consonant to trigger this " +
    "joining. Does your script do this?",
  type: "bool" as const,
  required: true,
  next: [
    { condition: "value == 'true'", goto: "pb_indic_virama" },
    { default: true, goto: "pb_indic_vowels_separate" },
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
    { value: "true", note: "script has conjuncts (virama needed)" },
    { value: "false", note: "no conjuncts" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
  ],
};


const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;

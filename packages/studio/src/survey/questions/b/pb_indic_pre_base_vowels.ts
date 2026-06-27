// Per-question module: pb_indic_pre_base_vowels (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "pb_indic_pre_base_vowels",
  prompt:
    "Does your script have any vowel marks that appear to the LEFT of the consonant they belong to?",
  help_text:
    "In Tamil, for example, one of the vowel marks appears to the left of " +
    "the consonant it marks, even though you type it after the consonant. " +
    "The keyboard and your computer handle the display order automatically, " +
    "but the studio needs to know this so it can build the right pattern. " +
    "Answer Yes if any vowel marks in your script appear to the left of " +
    "their consonant in the final display.",
  type: "bool" as const,
  required: true,
  next: "pb_indic_nukta_gate",
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
    { value: "true", note: "pre-base vowel marks present (e.g. Tamil)" },
    { value: "false", note: "no pre-base vowels" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
  ],
};


const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;

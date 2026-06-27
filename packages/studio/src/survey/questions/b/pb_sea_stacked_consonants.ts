// Per-question module: pb_sea_stacked_consonants (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "pb_sea_stacked_consonants",
  prompt:
    "Does your script stack consonants (place one on top of or below another) to represent consonant clusters?",
  help_text:
    "Some Southeast Asian scripts place consonants in a smaller form below " +
    "the main consonant row when consonants cluster together, for example in " +
    "Khmer where a small connector sign causes the following consonant to " +
    "appear as a smaller form below the base. This is different from the " +
    "side-attachment described in the previous question. Does your script " +
    "do this?",
  type: "bool" as const,
  required: true,
  // enter the shared universal tail (special letters, punctuation, digits, count)
  next: "pb_special_letters",
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
    { value: "true", note: "stacked consonants present (e.g. Khmer coeng)" },
    { value: "false", note: "no consonant stacking" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
  ],
};


const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;

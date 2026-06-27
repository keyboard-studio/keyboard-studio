// Per-question module: pb_syllabic_finals_gate (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "pb_syllabic_finals_gate",
  prompt:
    "Does your writing system use a special mark or a smaller character to show that a syllable ends with a consonant sound?",
  help_text:
    "Some syllabic writing systems have a small raised dot, a raised " +
    "letter form, or another special mark that shows the final consonant " +
    "of a syllable when no vowel follows it. For example, Canadian " +
    "Aboriginal Syllabics uses small raised forms and a centered dot for " +
    "this purpose. If your writing system has any such mark or form, " +
    "answer Yes.",
  type: "bool" as const,
  required: true,
  next: [
    { condition: "value == 'true'", goto: "pb_syllabic_finals_detail" },
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
    { value: "true", note: "final-consonant marks present (e.g. UCAS)" },
    { value: "false", note: "no final-consonant marks" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
  ],
};


const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;

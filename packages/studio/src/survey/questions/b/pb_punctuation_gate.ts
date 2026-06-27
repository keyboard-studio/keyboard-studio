// Per-question module: pb_punctuation_gate (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "pb_punctuation_gate",
  prompt:
    "Does your language use any punctuation marks that are not on a standard English keyboard?",
  help_text:
    "Standard English punctuation (period, comma, question mark, quotes, and " +
    "so on) is usually already on the base keyboard. Answer Yes only if your " +
    "language needs punctuation that is not part of standard English, for " +
    "example a special word-separator, a different style of quotation marks, " +
    "or a tonal or sentence-boundary mark.",
  type: "bool" as const,
  required: true,
  next: [
    { condition: "value == 'true'", goto: "pb_punctuation_list" },
    { default: true, goto: "pb_digit_set" },
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
    { value: "true", note: "language has non-English punctuation" },
    { value: "false", note: "standard English punctuation is sufficient" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
  ],
};


const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;

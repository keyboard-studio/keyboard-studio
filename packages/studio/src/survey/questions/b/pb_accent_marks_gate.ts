// Per-question module: pb_accent_marks_gate (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "pb_accent_marks_gate",
  prompt: "Does your language use accent marks or tone marks on letters?",
  help_text:
    "Accent marks are small signs placed above or below a letter that change " +
    "its sound or tone, for example the mark above the e in cafe (é), the " +
    "mark above the n in mañana (ñ), or a tone mark used in tonal languages. " +
    "If your language has any of these, answer Yes.",
  type: "bool" as const,
  required: true,
  next: [
    { condition: "value == 'true'", goto: "pb_diacritic_select" },
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
    { value: "true", note: "language has accent marks" },
    { value: "false", note: "language has no accent marks" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
  ],
};


const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;

// Per-question module: pb_special_letters (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "pb_special_letters",
  prompt:
    "Does your language use any special letters that are not found on a standard keyboard?",
  help_text:
    "These are letters with their own distinct shapes that are not just a " +
    "regular letter with an accent added -- for example, the open-e letter " +
    "that looks like a reversed 3 (used in many African languages), the eng " +
    "letter that looks like an n with a descending tail (for the ng sound), " +
    "or a schwa that looks like a rotated e. Answer Yes if your language has " +
    "any letters like this.",
  type: "bool" as const,
  required: true,
  next: [
    { condition: "value == 'true'", goto: "pb_special_letters_list" },
    { default: true, goto: "pb_punctuation_gate" },
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
    { value: "true", note: "language has special letters (e.g. ŋ, ɛ, ɔ)" },
    { value: "false", note: "no special letters" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
  ],
};


const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;

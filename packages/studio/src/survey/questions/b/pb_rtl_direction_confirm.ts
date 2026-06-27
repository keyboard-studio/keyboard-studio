// Per-question module: pb_rtl_direction_confirm (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "pb_rtl_direction_confirm",
  prompt: "Can you confirm that your text is written from right to left?",
  help_text:
    "Most right-to-left keyboards, such as those for Arabic and Hebrew, are " +
    "fully right-to-left. Confirming this helps the studio apply the correct " +
    "output pattern. Answer No if your community sometimes writes left-to-right " +
    "even though the script is normally right-to-left.",
  type: "bool" as const,
  required: true,
  next: "pb_rtl_short_vowels",
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
    { value: "true", note: "confirmed RTL script" },
    { value: "false", note: "not fully RTL" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
  ],
};


const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;

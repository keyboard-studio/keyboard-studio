// Per-question module: pb_digit_set (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "pb_digit_set",
  prompt: "Which digits does your language use?",
  help_text:
    "Most languages around the world use the same Western digits 0 through 9. " +
    "Some languages have their own traditional digit shapes (for example, " +
    "Arabic-Indic digits used in Arabic and Persian, Devanagari digits used " +
    "in Hindi). Choose whichever your community uses most, or both if both " +
    "are needed.",
  type: "radio" as const,
  required: true,
  options: [
    {
      value: "western",
      label: "Western digits 0 through 9 (the standard numeric row)",
    },
    {
      value: "native",
      label: "Digits in our own script (not the standard 0-9)",
    },
    {
      value: "both",
      label: "Both Western digits and our own script digits",
    },
  ],
  next: "pb_char_count",
} satisfies import("../../types.ts").FlowQuestion;

const VALID_VALUES = new Set(["western", "native", "both"]);

export function validate(
  value: string | string[] | undefined,
): ValidationResult {
  const v = typeof value === "string" ? value : "";
  if (!v) {
    return {
      ok: false,
      code: "required",
      message: "Please choose which digits your language uses.",
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
    { value: "western", note: "0-9 only" },
    { value: "native", note: "script-native digits" },
    { value: "both", note: "both digit sets" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
    { value: "arabic-indic", expectedCode: "invalid_option" },
  ],
};


const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;

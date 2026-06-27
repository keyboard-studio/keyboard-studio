// Per-question module: pb_indic_nukta_gate (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "pb_indic_nukta_gate",
  prompt:
    "Does your language use a small dot placed below a consonant letter to spell sounds borrowed from other languages?",
  help_text:
    "Many South Asian scripts include a small dot that can be placed " +
    "directly below a consonant to show that it represents a foreign " +
    "sound not native to the script. In Hindi written in Devanagari, " +
    "this dot is used for sounds borrowed from Arabic and Persian, for " +
    "example the letter for 'q' or sounds used in loanwords. If your " +
    "language uses a dot like this under any letter, answer Yes.",
  type: "bool" as const,
  required: true,
  next: [
    { condition: "value == 'true'", goto: "pb_indic_nukta_detail" },
    { default: true, goto: "pb_indic_vowels_onset" },
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
    { value: "true", note: "nukta used for loanword sounds" },
    { value: "false", note: "no nukta" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
  ],
};


const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;

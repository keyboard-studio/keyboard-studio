// Per-question module: pb_mark_input_order (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.
// A3a sub-axis probe; only shown when pb_typing_approach == "phonetic".

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "pb_mark_input_order",
  prompt:
    "When typing a letter with a diacritic, does the typist expect to press the diacritic key before the letter, or type the letter first and then the diacritic?",
  help_text:
    "For example: pressing the diacritic key first and then the letter (like " +
    "pressing a key for an acute accent and then a to get a-with-acute, or " +
    "pressing an underdot key before s to get s-with-underdot), or typing " +
    "the letter first and then a suffix key (like typing a and then a special " +
    "key to add the diacritic after). There is no wrong answer -- this depends " +
    "on what feels natural to your community and what existing keyboards " +
    "already do.",
  type: "radio" as const,
  required: true,
  options: [
    {
      value: "prefix",
      label:
        "Diacritic key first, then the letter (the diacritic key is pressed before the base letter)",
    },
    {
      value: "postfix",
      label:
        "Letter first, then the diacritic key (type the base letter, then press a key to add the diacritic)",
    },
  ],
  next: "pb_special_letters",
} satisfies import("../../types.ts").FlowQuestion;

const VALID_VALUES = new Set(["prefix", "postfix"]);

export function validate(
  value: string | string[] | undefined,
): ValidationResult {
  const v = typeof value === "string" ? value : "";
  if (!v) {
    return {
      ok: false,
      code: "required",
      message: "Please choose the mark-input order.",
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
    { value: "prefix", note: "A3a: prefix (dead-key style)" },
    { value: "postfix", note: "A3a: postfix (drives rule 3a -> S-03+S-04)" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
    { value: "simultaneous", expectedCode: "invalid_option" },
  ],
};


const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;

// Per-question module: pb_mark_style (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "pb_mark_style",
  prompt:
    "When you type a letter with an accent mark, which approach do you prefer?",
  help_text:
    "There are two main ways a keyboard can produce an accented letter. The " +
    "first is to type it as a single ready-made character that already has the " +
    "accent built in -- this is simpler and works in all programs. The second " +
    "is to type the base letter first and then the accent mark separately -- " +
    "this is more flexible when ready-made characters do not exist for every " +
    "combination your language needs. Your choice affects which patterns the " +
    "studio will suggest.",
  type: "radio" as const,
  required: true,
  options: [
    {
      value: "precomposed",
      label:
        "Single ready-made character with the accent already built in (simpler, best when ready-made characters exist for all your combinations)",
    },
    {
      value: "combining",
      label:
        "Base letter followed by a separate accent mark (more flexible when not all combinations exist as ready-made characters)",
    },
    {
      value: "either",
      label: "Either way is fine for my language",
    },
  ],
  next: "pb_capitals_marks",
} satisfies import("../../types.ts").FlowQuestion;

const VALID_VALUES = new Set(["precomposed", "combining", "either"]);

export function validate(
  value: string | string[] | undefined,
): ValidationResult {
  const v = typeof value === "string" ? value : "";
  if (!v) {
    return {
      ok: false,
      code: "required",
      message: "Please choose an approach for typing accented letters.",
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
    { value: "precomposed", note: "precomposed preference" },
    { value: "combining", note: "combining preference" },
    { value: "either", note: "no preference" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
    { value: "other", expectedCode: "invalid_option" },
  ],
};


const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;

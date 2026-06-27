// Per-question module: pb_capitals_marks (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "pb_capitals_marks",
  prompt:
    "When you write a capital letter that normally has an accent mark, does the capital letter keep the accent?",
  help_text:
    "In some languages, capital letters always keep their accent marks (for " +
    "example, a capital E with an acute mark). In other languages, accent " +
    "marks are dropped on capitals (for example, French often drops accents on " +
    "capitals). Choose the rule your language community follows.",
  type: "radio" as const,
  required: true,
  options: [
    {
      value: "keep",
      label: "Yes, capital letters keep their accent marks",
    },
    {
      value: "drop",
      label: "No, accent marks are dropped on capital letters",
    },
    {
      value: "optional",
      label: "It depends or there is no firm rule",
    },
  ],
  next: "pb_typing_approach",
} satisfies import("../../types.ts").FlowQuestion;

const VALID_VALUES = new Set(["keep", "drop", "optional"]);

export function validate(
  value: string | string[] | undefined,
): ValidationResult {
  const v = typeof value === "string" ? value : "";
  if (!v) {
    return {
      ok: false,
      code: "required",
      message: "Please choose whether capitals keep their accent marks.",
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
    { value: "keep", note: "capitals keep marks" },
    { value: "drop", note: "capitals drop marks (e.g. French)" },
    { value: "optional", note: "no firm rule" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
    { value: "always", expectedCode: "invalid_option" },
  ],
};


const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;

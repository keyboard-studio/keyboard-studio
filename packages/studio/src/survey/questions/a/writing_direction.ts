// Per-question module: writing_direction (Phase A)
// Ported verbatim from content/flows/phase_a_identity.yaml.
// Shown only for Arabic and Hebrew; Latin auto-sets LTR without asking.

import type { QuestionModule, ValidationResult } from "../../types.ts";

import { irPath } from "@keyboard-studio/contracts";

const VALID_DIRECTIONS = new Set(["rtl", "ltr"]);

export const definition = {
  id: "writing_direction",
  prompt: "Does your text run right-to-left or left-to-right?",
  help_text:
    "Arabic and Hebrew are usually written right-to-left, but some communities " +
    "use a left-to-right style for certain contexts. Choose the direction your " +
    "community uses most.",
  type: "radio" as const,
  required: true,
  options: [
    { value: "rtl", label: "Right to left (the usual direction for Arabic and Hebrew)" },
    { value: "ltr", label: "Left to right" },
  ],
  next: "layout_family",
} satisfies import("../../types.ts").FlowQuestion;

export function validate(
  value: string | string[] | undefined,
): ValidationResult {
  const v = typeof value === "string" ? value : Array.isArray(value) ? value[0] ?? "" : "";

  if (v.length === 0) {
    return { ok: false, code: "required", message: "Please select a writing direction." };
  }
  if (!VALID_DIRECTIONS.has(v)) {
    return { ok: false, code: "invalid_option", message: `"${v}" is not a valid direction.` };
  }
  return { ok: true };
}

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "rtl", note: "right-to-left" },
    { value: "ltr", note: "left-to-right" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
    { value: "btt", expectedCode: "invalid_option", note: "not a valid direction" },
  ],
};


const mod: QuestionModule = {
  definition,
  validate,
  fixtures,
  inputs: [irPath("header", "bcp47")],
  writes: [],
};
export default mod;

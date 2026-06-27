// Per-question module: pb_text_sample_review (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "pb_text_sample_review",
  prompt:
    "Here are the characters we found in your text. Do you want to continue with this list?",
  help_text:
    "We extracted every distinct character from what you pasted. Characters " +
    "your base keyboard already produces are shown greyed out -- you do not " +
    "need to add those. Tick any you want to keep, untick any that crept in " +
    "by mistake, and add any that are missing. When you are happy, click " +
    "Continue. You can also answer the step-by-step questions afterward to " +
    "fill any gaps.",
  type: "bool" as const,
  required: true,
  next: [
    { condition: "value == 'true'", goto: "pb_routing_branch" },
    { default: true, goto: "pb_routing_branch" },
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
      message: "Please confirm whether to continue with this list.",
    };
  }
  return { ok: true };
}

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "true", note: "user accepts list" },
    { value: "false", note: "user declines list" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
  ],
};


const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;

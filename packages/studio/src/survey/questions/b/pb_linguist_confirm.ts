// Per-question module: pb_linguist_confirm (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "pb_linguist_confirm",
  prompt:
    "Here is a suggested character list for {{language_name}}. Do you want to use it as your starting point?",
  help_text:
    "We assembled this list from standard language reference sources and " +
    "character databases for your language. Please review it carefully -- " +
    "the list may not be perfect for your specific community or orthography. " +
    "Accept it as a starting point, or decline and build your own list using " +
    "the step-by-step questions. You can always add or remove characters " +
    "later.",
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
      message: "Please confirm whether to use the suggested list.",
    };
  }
  return { ok: true };
}

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "true", note: "user accepts suggested list" },
    { value: "false", note: "user declines suggested list" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
  ],
};


const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;

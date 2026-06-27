// Per-question module: region (Phase A)
// Ported verbatim from content/flows/phase_a_identity.yaml.

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "region",
  prompt: "Which country or region is this keyboard mainly for?",
  help_text:
    "Name the primary country or region where speakers of your language live, " +
    "for example: Cameroon, Tanzania, Northwest India. You can list more " +
    "than one if needed.",
  type: "text" as const,
  required: true,
  next: "primary_script",
} satisfies import("../../types.ts").FlowQuestion;

export function validate(
  value: string | string[] | undefined,
): ValidationResult {
  const trimmed =
    typeof value === "string"
      ? value.trim()
      : Array.isArray(value)
        ? value.join("").trim()
        : "";

  if (trimmed.length === 0) {
    return { ok: false, code: "required", message: "Region or country is required." };
  }
  return { ok: true };
}

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "Cameroon", note: "single country" },
    { value: "Northwest India", note: "region within a country" },
    { value: "Tanzania, Kenya", note: "multiple countries" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: "   ", expectedCode: "required", note: "whitespace-only" },
    { value: undefined, expectedCode: "required" },
  ],
};


const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;

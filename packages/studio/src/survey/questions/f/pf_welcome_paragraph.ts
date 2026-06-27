// Per-question module: pf_welcome_paragraph (Phase F)
// Ported verbatim from content/flows/phase_f_helpdocs.yaml.

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "pf_welcome_paragraph",
  prompt: "In 1–3 sentences, what is this keyboard for?",
  help_text:
    "Describe what the keyboard does and who uses it. This text appears at the " +
    "very top of the keyboard's help page, so write it in plain language that " +
    "any user can understand. Avoid technical terms. For example: \"This " +
    "keyboard lets you type Bafut (Fa') on any computer. It includes all the " +
    "tone marks and special letters used in the Bafut alphabet.\"",
  type: "text" as const,
  required: true,
  next: "pf_usage_tip_1",
} satisfies import("../../types.ts").FlowQuestion;

export function validate(
  value: string | string[] | undefined,
): ValidationResult {
  const text =
    typeof value === "string"
      ? value.trim()
      : Array.isArray(value)
        ? value.join("").trim()
        : "";
  if (text.length === 0) {
    return {
      ok: false,
      code: "required",
      message: "Please write a short description of what this keyboard is for.",
    };
  }
  return { ok: true };
}

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    {
      value:
        "This keyboard lets you type Bafut (Fa') on any computer. It includes all the tone marks and special letters used in the Bafut alphabet.",
      note: "canonical example from YAML",
    },
    {
      value: "Keyboard for typing Ewondo on Windows, macOS, and Linux.",
      note: "minimal valid description",
    },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: "   ", expectedCode: "required", note: "whitespace only" },
    { value: undefined, expectedCode: "required" },
  ],
};


const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;

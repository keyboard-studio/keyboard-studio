// Per-question module: language_name_english (Phase A)
// Ported verbatim from content/flows/phase_a_identity.yaml.

import type { QuestionModule, ValidationResult } from "../../types.ts";

import { irPath } from "@keyboard-studio/contracts";

export const definition = {
  id: "language_name_english",
  prompt: "What is your language called in English?",
  help_text:
    "The English name used in directories and official language lists, for " +
    "example: Bafut, Swahili, Hindi. If your language does not have a " +
    "widely-used English name, repeat the name you gave above.",
  type: "text" as const,
  required: true,
  next: "iso_code",
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
    return { ok: false, code: "required", message: "English language name is required." };
  }
  return { ok: true };
}

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "Bafut", note: "simple ASCII name" },
    { value: "Swahili", note: "common English name" },
    { value: "  Hindi  ", note: "leading/trailing whitespace trimmed" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: "   ", expectedCode: "required", note: "whitespace-only" },
    { value: undefined, expectedCode: "required" },
  ],
};


const mod: QuestionModule = {
  definition,
  validate,
  fixtures,
  inputs: [],
  writes: [irPath("header", "name")],
};
export default mod;

// Per-question module: il_language_english (identity-lite)
// Ported verbatim from content/flows/identity_lite.yaml.
//
// The autonym-to-English seed (getSeedValue in IdentityLite.tsx) stays in the
// component — do NOT move that seeding logic here.

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "il_language_english",
  prompt: "What is your language called in English?",
  help_text:
    "The English name used in directories and official language lists, for " +
    "example: Bafut, Swahili, Hindi. If your language has no widely-used English " +
    "name, repeat the name you gave above.",
  type: "text" as const,
  required: true,
  next: "il_language_code",
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

// mutate: STUB — KeyboardIR mutation surface is not yet a real contract.

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

const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;

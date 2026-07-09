// Per-question module: il_language_english (identity-lite)
//
// SECOND question (spec 030): a confirmation of the English name, PRE-FILLED
// from the langtags entry resolved by il_language_code (getSeedValue in
// IdentityLite.tsx seeds it from the resolved entry's englishName). The author
// confirms or edits it — this is the display name that lands on the package.
// When il_language_code was left blank / matched nothing, this arrives empty and
// the author types it (graceful degradation, spec 030 FR-003).

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "il_language_english",
  prompt: "What is your language called in English?",
  help_text:
    "The English name used in directories and official language lists, for " +
    "example: Bafut, Swahili, Hindi. Pre-filled from your selection above — edit " +
    "it if you prefer a different name.",
  type: "text" as const,
  required: true,
  next: "il_language_autonym",
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

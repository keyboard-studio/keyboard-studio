// Per-question module: il_language_autonym (identity-lite)
//
// SECOND question (spec 030 US2, FR-009): the language name in the community's
// own script. IdentityLite.tsx offers a dropdown sourced from langtags as a
// fallback chain — recorded own-script names (localname + localnames) when the
// language has any, otherwise the English/alternate names (name + names) — via
// getSeedOptions, with a free-text override.
// getSeedValue defaults it to the primary own-script name when langtags has one;
// when it has none (~60% of languages — T008, and free-text/unmatched languages)
// it falls back to the Q1 English name. Advances to il_language_code.

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "il_language_autonym",
  prompt: "What is your language called in your own language?",
  help_text:
    "The name your community uses for the language, in your own spelling and " +
    "characters. For example: Fà', Kiswahili, हिन्दी. Pick a suggested name or " +
    "type your own — edit it to match your spelling.",
  type: "autocomplete" as const,
  required: true,
  next: "il_language_code",
} satisfies import("../../types.ts").FlowQuestion;

export function validate(
  value: string | string[] | undefined,
): ValidationResult {
  const trimmed = typeof value === "string"
    ? value.trim()
    : Array.isArray(value)
      ? value.join("").trim()
      : "";

  if (trimmed.length === 0) {
    return { ok: false, code: "required", message: "Language name is required." };
  }
  return { ok: true };
}

// mutate: STUB — KeyboardIR mutation surface is not yet a real contract.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "Faʼ", note: "Bafut autonym" },
    { value: "Kiswahili", note: "ASCII-only autonym" },
    { value: "हिन्दी", note: "Devanagari autonym" },
    { value: "  Fula  ", note: "leading/trailing whitespace — trimmed to non-empty" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: "   ", expectedCode: "required", note: "whitespace-only" },
    { value: undefined, expectedCode: "required" },
  ],
};

const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;

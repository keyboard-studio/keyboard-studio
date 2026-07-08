// Per-question module: il_language_autonym (identity-lite)
//
// THIRD question (spec 030): the language name in the community's own script.
// PRE-FILLED from the langtags entry resolved by il_language_code (getSeedValue
// in IdentityLite.tsx seeds it from the resolved entry's autonym); the author
// confirms or edits it. Only ~40% of langtags languages carry a local name, so
// this frequently arrives empty and the author types it (spec 030 T008 / FR-005).
// US2 will turn this into a multi-choice picker over the entry's localNames;
// for now it is a single-value pre-filled text field.

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "il_language_autonym",
  prompt: "What is your language called in your own language?",
  help_text:
    "The name your community uses for the language, in your own spelling and " +
    "characters. For example: Fà', Kiswahili, हिन्दी. Pre-filled from your " +
    "selection above when available — edit it to match your spelling.",
  type: "text" as const,
  required: true,
  next: "il_target_script",
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

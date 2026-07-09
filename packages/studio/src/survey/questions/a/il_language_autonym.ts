// Per-question module: il_language_autonym (identity-lite)
//
// THIRD question (spec 030): the language name in the community's own script.
// A multi-choice picker over the langtags entry's recorded local names, with a
// free-text override (spec 030 US2). IdentityLite.tsx supplies the options via
// getSeedOptions (the resolved entry's localNames) and pre-fills the primary
// autonym via getSeedValue. Only ~40% of langtags languages carry a local name
// (T008), so the option list is frequently empty — the `autocomplete` field
// then behaves as a plain free-text input, which the author types (FR-005).

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

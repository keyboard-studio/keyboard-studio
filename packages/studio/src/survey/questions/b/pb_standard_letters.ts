// Per-question module: pb_standard_letters (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.

import type { QuestionModule, ValidationResult } from "../../types.ts";
import { irPath, ARRAY_INDEX } from "@keyboard-studio/contracts";

export const definition = {
  id: "pb_standard_letters",
  prompt: "Which best describes the letters your language uses?",
  help_text:
    "Think about the alphabet your language is written in. Pick the option " +
    "that best matches. If you are not sure, pick the closest one and you " +
    "can refine it later.",
  type: "radio" as const,
  required: true,
  options: [
    {
      value: "basic-az",
      label: "Only the basic A to Z letters, no accented or special letters",
    },
    {
      value: "extended-latin",
      label:
        "A to Z plus extra letters with accent marks or special shapes (like é, ñ, or ŋ)",
    },
    {
      value: "other-alphabet",
      label: "A completely different alphabet or writing system",
    },
    {
      value: "other",
      label: "Something else or I am not sure",
    },
  ],
  next: [
    { condition: "value == 'other-alphabet'", goto: "pb_non_roman_branch" },
    { default: true, goto: "pb_accent_marks_gate" },
  ],
} satisfies import("../../types.ts").FlowQuestion;

const VALID_VALUES = new Set([
  "basic-az",
  "extended-latin",
  "other-alphabet",
  "other",
]);

export function validate(
  value: string | string[] | undefined,
): ValidationResult {
  const v = typeof value === "string" ? value : "";
  if (!v) {
    return {
      ok: false,
      code: "required",
      message: "Please choose which letters your language uses.",
    };
  }
  if (!VALID_VALUES.has(v)) {
    return {
      ok: false,
      code: "invalid_option",
      message: `"${v}" is not a valid choice.`,
    };
  }
  return { ok: true };
}

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "basic-az", note: "only A-Z" },
    { value: "extended-latin", note: "Latin with diacritics" },
    { value: "other-alphabet", note: "non-Latin" },
    { value: "other", note: "unsure" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
    { value: "cyrillic", expectedCode: "invalid_option" },
  ],
};

// T010: inputs/writes VERIFIED for this specific question — not a template to copy.
// pb_standard_letters reads the header BCP47 tag established by Phase A identity
// questions, and will write the selected script group into the stores array in P5.
// Rationale: header.bcp47 tells us the target language/script; stores[] is where
// the script-group discriminator store lands at scaffold time.
// Do NOT clone these declarations blindly into other question modules; each module
// must declare its own actual IR dependencies (or explicit empty arrays).
const mod: QuestionModule = {
  definition,
  validate,
  fixtures,
  inputs: [irPath("header", "bcp47")],
  writes: [irPath("stores", ARRAY_INDEX)],
};
export default mod;

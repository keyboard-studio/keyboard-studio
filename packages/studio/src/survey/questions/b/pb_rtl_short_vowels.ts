// Per-question module: pb_rtl_short_vowels (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "pb_rtl_short_vowels",
  prompt:
    "In your language, are the short vowel marks (the small marks above and below consonants) always written, sometimes written, or never written in normal text?",
  help_text:
    "In many right-to-left scripts, the short vowel marks (the small marks " +
    "placed above and below consonant letters to show vowel sounds) are left " +
    "out in everyday text but included in religious, educational, or " +
    "children's materials. In other scripts, they are always written. This " +
    "affects how the keyboard is laid out.",
  type: "radio" as const,
  required: true,
  options: [
    {
      value: "always",
      label: "Always written in normal text",
    },
    {
      value: "sometimes",
      label:
        "Sometimes written (for example, in educational or religious text only)",
    },
    {
      value: "never",
      label: "Never or almost never written",
    },
  ],
  next: "pb_rtl_direction_marks",
} satisfies import("../../types.ts").FlowQuestion;

const VALID_VALUES = new Set(["always", "sometimes", "never"]);

export function validate(
  value: string | string[] | undefined,
): ValidationResult {
  const v = typeof value === "string" ? value : "";
  if (!v) {
    return {
      ok: false,
      code: "required",
      message: "Please choose how short vowel marks are used in your language.",
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
    { value: "always", note: "tashkeel always written (e.g. Classical Arabic)" },
    { value: "sometimes", note: "written in educational/religious text only" },
    { value: "never", note: "bare consonant text only" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
    { value: "optional", expectedCode: "invalid_option" },
  ],
};


const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;

// Per-question module: pb_syllabic_note (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "pb_syllabic_note",
  prompt:
    "In your writing system, does each character represent a complete syllable, or do you combine parts (such as a consonant symbol and a vowel symbol) to form a syllable?",
  help_text:
    "Some writing systems give each possible syllable its own distinct " +
    "character that you type with a single keypress (for example, Cherokee " +
    "and Vai). Others let you build a syllable by combining a consonant symbol " +
    "with a vowel symbol (for example, Canadian Aboriginal Syllabics). This " +
    "branch covers Vai, Cherokee, and Canadian Aboriginal Syllabics.",
  type: "radio" as const,
  required: true,
  options: [
    {
      value: "one-char-per-syllable",
      label:
        "Each syllable has its own distinct character (I do not combine parts)",
    },
    {
      value: "combine-parts",
      label:
        "I combine a consonant symbol and a vowel symbol to form each syllable",
    },
    {
      value: "mixed",
      label:
        "Both -- some syllables have their own character, others are combined",
    },
  ],
  next: "pb_syllabic_grid",
} satisfies import("../../types.ts").FlowQuestion;

const VALID_VALUES = new Set(["one-char-per-syllable", "combine-parts", "mixed"]);

export function validate(
  value: string | string[] | undefined,
): ValidationResult {
  const v = typeof value === "string" ? value : "";
  if (!v) {
    return {
      ok: false,
      code: "required",
      message: "Please choose how syllables are written in your script.",
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
    { value: "one-char-per-syllable", note: "Cherokee, Vai style" },
    { value: "combine-parts", note: "Canadian Aboriginal Syllabics style" },
    { value: "mixed", note: "mixed approach" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
    { value: "abugida", expectedCode: "invalid_option" },
  ],
};


const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;

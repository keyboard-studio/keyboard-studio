// Per-question module: pb_syllabic_grid (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "pb_syllabic_grid",
  prompt:
    "Is your character set organized as a grid where rows are consonants and columns are vowels (or vice versa)?",
  help_text:
    "Many syllabic writing systems have a natural grid structure: each row " +
    "represents a consonant sound and each column represents a vowel sound, " +
    "so the character at row C column V represents the syllable CV. Knowing " +
    "this helps the studio suggest a grid-style keyboard layout. If your " +
    "writing system works differently, choose No.",
  type: "bool" as const,
  required: true,
  next: "pb_syllabic_finals_gate",
} satisfies import("../../types.ts").FlowQuestion;

export function validate(
  value: string | string[] | undefined,
): ValidationResult {
  const v = typeof value === "string" ? value : "";
  if (v !== "true" && v !== "false") {
    return {
      ok: false,
      code: "required",
      message: "Please answer Yes or No.",
    };
  }
  return { ok: true };
}

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "true", note: "grid-organized syllabary" },
    { value: "false", note: "non-grid syllabary" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
  ],
};


const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;

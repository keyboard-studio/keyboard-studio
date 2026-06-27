// Per-question module: pb_stacking_marks (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "pb_stacking_marks",
  prompt:
    "Can a single letter carry more than one accent mark at the same time?",
  help_text:
    "In some languages, like Igbo, a vowel letter can carry both a dot mark " +
    "below it and a tone mark above it at the same time -- both marks are " +
    "present on the final character together. If your language ever needs two " +
    "marks on the same base letter simultaneously (not cycling or replacing, " +
    "but both present at once), answer Yes.",
  type: "bool" as const,
  required: true,
  next: [
    { condition: "value == 'true'", goto: "pb_mark_style" },
    // Ported verbatim from source YAML: `- default: pb_mark_style`.
    // The conditional branch above and this default resolve to the same target.
    // The dead conditional is intentional source fidelity; tracked for cleanup
    // in the source YAML via bug(content): pb_stacking_marks next routing collapses.
    { default: true, goto: "pb_mark_style" },
  ],
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
    { value: "true", note: "stacking marks present (A4: stacking-combining)" },
    { value: "false", note: "no stacking" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
  ],
};


const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;

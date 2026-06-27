// Per-question module: pb_sea_medials (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "pb_sea_medials",
  prompt:
    "Does your script use letters that attach to the side of a base consonant to show a combined sound?",
  help_text:
    "In Myanmar (Burmese), for example, certain consonants can appear in a " +
    "smaller form attached to the side of another consonant to represent " +
    "sounds like 'ky', 'py', or 'my'. In Khmer, similar forms appear below " +
    "the base consonant. These attached forms are different from the Indic " +
    "consonant-joining pattern. Does your script have these?",
  type: "bool" as const,
  required: true,
  next: "pb_sea_stacked_consonants",
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
    { value: "true", note: "medial letters present (e.g. Myanmar)" },
    { value: "false", note: "no medial letters" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
  ],
};


const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;

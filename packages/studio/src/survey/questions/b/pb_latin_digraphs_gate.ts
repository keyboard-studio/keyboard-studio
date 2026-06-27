// Per-question module: pb_latin_digraphs_gate (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "pb_latin_digraphs_gate",
  prompt:
    "Does your language treat any combination of letters (two or more) as a single sound -- one that you might want on its own dedicated key?",
  help_text:
    "Some languages use multi-letter combinations to spell a single " +
    "sound, such as 'sh', 'ts', 'ny', or 'ng'. If your language treats " +
    "a combination like this as its own unit -- the way English treats " +
    "'ch' or Hausa treats 'sh', or Welsh treats 'ngh' -- it may deserve " +
    "its own key rather than being typed as separate letters. Answer Yes " +
    "if any multi-letter combinations work this way in your language.",
  type: "bool" as const,
  required: true,
  next: [
    { condition: "value == 'true'", goto: "pb_latin_digraphs_list" },
    { default: true, goto: "pb_punctuation_gate" },
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
    { value: "true", note: "language has digraphs (e.g. sh, ng, ch)" },
    { value: "false", note: "no digraphs needing dedicated keys" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
  ],
};


const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;

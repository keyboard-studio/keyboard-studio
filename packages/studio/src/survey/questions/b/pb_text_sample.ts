// Per-question module: pb_text_sample (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "pb_text_sample",
  prompt: "Paste a paragraph or more of text written in your language.",
  help_text:
    "The longer the text, the better. Anything works: a story, a Bible " +
    "passage, a news article, or even a short sentence. We will find every " +
    "distinct character and build your character list from it. You can still " +
    "review and edit the list after. Please paste at least one full sentence.",
  type: "text" as const,
  required: true,
  next: "pb_text_sample_review",
} satisfies import("../../types.ts").FlowQuestion;

export function validate(
  value: string | string[] | undefined,
): ValidationResult {
  const text =
    typeof value === "string"
      ? value.trim()
      : Array.isArray(value)
        ? value.join("").trim()
        : "";
  if (text.length === 0) {
    return {
      ok: false,
      code: "required",
      message: "Please paste at least one sentence of text.",
    };
  }
  return { ok: true };
}

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "Ndap mi nɛ́ faʼ.", note: "short Bafut sentence" },
    {
      value:
        "In the beginning God created the heavens and the earth.",
      note: "English sample",
    },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: "   ", expectedCode: "required", note: "whitespace only" },
    { value: undefined, expectedCode: "required" },
  ],
};


const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;

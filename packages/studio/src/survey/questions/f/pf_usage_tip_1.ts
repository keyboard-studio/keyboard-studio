// Per-question module: pf_usage_tip_1 (Phase F)
// Ported verbatim from content/flows/phase_f_helpdocs.yaml.

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "pf_usage_tip_1",
  prompt: "What is the most important thing to know when using this keyboard?",
  help_text:
    "Give one short tip, for example how to type a character that is not " +
    "obvious or a key combination for a common accent mark. Keep it to one or " +
    "two sentences. Screenshots can be added to the keyboard package separately " +
    "and do not need to be described here.",
  type: "text" as const,
  required: true,
  next: "pf_usage_tip_2",
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
      message: "Please provide at least one usage tip.",
    };
  }
  return { ok: true };
}

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    {
      value: "Press the backtick key (`) followed by a vowel to add a grave accent.",
      note: "dead-key tip",
    },
    {
      value: "Use AltGr + e to type é.",
      note: "AltGr tip",
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

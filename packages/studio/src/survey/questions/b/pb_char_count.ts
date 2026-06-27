// Per-question module: pb_char_count (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.
// Drives A1 (scale) axis.

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "pb_char_count",
  prompt:
    "Roughly how many NEW characters does your keyboard need to add, beyond what the base keyboard already has?",
  help_text:
    "Count only characters that are not already on a standard keyboard for " +
    "your layout. Do not count the regular A-Z letters or standard " +
    "punctuation. A rough estimate is fine -- this helps the studio choose " +
    "the right approach for your keyboard. If you answered the questions " +
    "above, think about how many distinct letters and marks you listed.",
  type: "radio" as const,
  required: true,
  options: [
    { value: "tiny", label: "Fewer than 5 new characters" },
    { value: "small", label: "5 to 20 new characters" },
    { value: "medium", label: "21 to 100 new characters" },
    { value: "large", label: "More than 100 new characters" },
  ],
  next: [
    {
      condition: "ctx.routing_group == 'qwerty-qwertz'",
      goto: "pb_latin_qwerty_branch",
    },
    {
      condition: "ctx.routing_group == 'azerty'",
      goto: "pb_latin_azerty_branch",
    },
    { default: true, goto: "pb_contact_language" },
  ],
} satisfies import("../../types.ts").FlowQuestion;

const VALID_VALUES = new Set(["tiny", "small", "medium", "large"]);

export function validate(
  value: string | string[] | undefined,
): ValidationResult {
  const v = typeof value === "string" ? value : "";
  if (!v) {
    return {
      ok: false,
      code: "required",
      message: "Please choose how many new characters your keyboard needs.",
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
    { value: "tiny", note: "A1: tiny (< 5 chars)" },
    { value: "small", note: "A1: small (5-20 chars)" },
    { value: "medium", note: "A1: medium (21-100 chars)" },
    { value: "large", note: "A1: large (>100 chars)" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
    { value: "massive", expectedCode: "invalid_option", note: "not a Phase B value per spec §9/§16" },
  ],
};


const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;

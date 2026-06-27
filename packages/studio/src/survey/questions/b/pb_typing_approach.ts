// Per-question module: pb_typing_approach (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.
// Drives A3 (phonetic intuition) axis.

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "pb_typing_approach",
  prompt:
    "How would you most naturally type an accented letter on this keyboard?",
  help_text:
    "Think about how you would want the keyboard to behave. Choose the method " +
    "that feels most natural to you. If you are familiar with more than one, " +
    "choose the one you most prefer for this language.",
  type: "radio" as const,
  required: true,
  options: [
    {
      value: "phonetic",
      label:
        "Type the Latin spelling of the sound -- the keyboard figures out the right letter from the sound it represents",
    },
    {
      value: "lookalike",
      label:
        "Press a key that looks similar to the letter I want -- for example, pressing the N key to get an n-like letter",
    },
    {
      value: "modifier-base",
      label:
        "Hold or press a special key first (like a key you press that makes no letter by itself), then press the base letter",
    },
    {
      value: "direct",
      label: "Press one key that directly produces the letter with its accent",
    },
  ],
  next: [
    { condition: "value == 'phonetic'", goto: "pb_mark_input_order" },
    { default: true, goto: "pb_special_letters" },
  ],
} satisfies import("../../types.ts").FlowQuestion;

const VALID_VALUES = new Set(["phonetic", "lookalike", "modifier-base", "direct"]);

export function validate(
  value: string | string[] | undefined,
): ValidationResult {
  const v = typeof value === "string" ? value : "";
  if (!v) {
    return {
      ok: false,
      code: "required",
      message: "Please choose how you would most naturally type an accented letter.",
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
    { value: "phonetic", note: "A3: strong" },
    { value: "lookalike", note: "A3: weak" },
    { value: "modifier-base", note: "A3: weak" },
    { value: "direct", note: "A3: weak" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
    { value: "deadkey", expectedCode: "invalid_option" },
  ],
};


const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;

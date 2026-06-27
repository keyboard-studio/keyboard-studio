// Per-question module: il_language_autonym (identity-lite)
// Ported verbatim from content/flows/identity_lite.yaml.
//
// This is the opening question of the identity-lite mini-flow (spec §8
// "Workflow ordering"). It captures the language name in the community's own
// script and spelling. The autonym is later seeded into il_language_english
// by IdentityLite.tsx getSeedValue — that seeding logic stays in the component.

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "il_language_autonym",
  prompt: "What is your language called in your own language?",
  help_text:
    "Type the name your community uses for the language, using your own spelling " +
    "and characters. For example: Fà', Kiswahili, हिन्दी.",
  type: "text" as const,
  required: true,
  next: "il_language_english",
} satisfies import("../../types.ts").FlowQuestion;

export function validate(
  value: string | string[] | undefined,
): ValidationResult {
  const trimmed =
    typeof value === "string"
      ? value.trim()
      : Array.isArray(value)
        ? value.join("").trim()
        : "";
  if (trimmed.length === 0) {
    return { ok: false, code: "required", message: "Language name is required." };
  }
  return { ok: true };
}

// mutate: STUB — KeyboardIR mutation surface is not yet a real contract.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "Faʼ", note: "Bafut autonym" },
    { value: "Kiswahili", note: "ASCII-only autonym" },
    { value: "हिन्दी", note: "Devanagari autonym" },
    { value: "  Fula  ", note: "leading/trailing whitespace — trimmed to non-empty" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: "   ", expectedCode: "required", note: "whitespace-only" },
    { value: undefined, expectedCode: "required" },
  ],
};

const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;

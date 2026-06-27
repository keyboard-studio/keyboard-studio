// Per-question module: language_name_autonym (Phase A)
// Ported verbatim from content/flows/phase_a_identity.yaml.
//
// Routing decision (B): routing lives in definition.next so all per-question
// behaviour is colocated in this module rather than scattered across a thin
// YAML list. See loadModularFlow.ts for the rationale comment.

import type { QuestionModule, ValidationResult } from "../../types.ts";

// `satisfies` preserves the literal type of next: "language_name_english" rather than
// widening it to string | null | FlowGotoRule[]. Do NOT change this to `: FlowQuestion`.
export const definition = {
  id: "language_name_autonym",
  prompt: "What is your language called in your own language?",
  help_text:
    "Type the name your community uses for the language, using your own " +
    "spelling and characters. For example: Faʼ, Kiswahili, हिन्दी. " +
    "This name will appear on the keyboard package exactly as you write it.",
  type: "text" as const,
  required: true,
  next: "language_name_english",
} satisfies import("../../types.ts").FlowQuestion;

/**
 * Validate the autonym value.
 * Rules:
 *   1. Value must be present and non-empty after trimming.
 * No character-set constraints — the whole point is to accept any script.
 */
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
// export function mutate(value, ctx): Partial<KeyboardIR> { ... }

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "Faʼ", note: "Bafut autonym with apostrophe-like character" },
    { value: "Kiswahili", note: "ASCII-only autonym" },
    {
      value: "हिन्ही",
      note: "Devanagari autonym",
    },
    { value: "  Fula  ", note: "leading/trailing whitespace — trimmed to non-empty" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: "   ", expectedCode: "required", note: "whitespace-only" },
  ],
};

const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;

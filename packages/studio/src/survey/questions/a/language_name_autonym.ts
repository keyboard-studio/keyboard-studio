// Per-question module: language_name_autonym (Phase A — PROPOSED flow)
//
// Mirrors the live IdentityLite own-language-name step (spec 030 FR-015): it
// follows the English name and offers the resolved language's recorded local
// names as choices (with free-text override), then advances to the code
// question. The proposed Phase A flow is display-only (rendered as a graph in
// the Flow Map, not run live), so this module carries the same shape as its
// live counterpart il_language_autonym for consistency.

import type { QuestionModule, ValidationResult } from "../../types.ts";

// `satisfies` preserves the literal type of next: "iso_code" rather than
// widening it to string | null | FlowGotoRule[]. Do NOT change this to `: FlowQuestion`.
export const definition = {
  id: "language_name_autonym",
  prompt: "What is your language called in your own language?",
  help_text:
    "The name your community uses for the language, in your own spelling and " +
    "characters. For example: Fà', Kiswahili, हिन्दी. Pick a suggested name or " +
    "type your own — it appears on the keyboard package exactly as you write it.",
  type: "autocomplete" as const,
  required: true,
  next: "iso_code",
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

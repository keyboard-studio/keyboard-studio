// Per-question module: language_name_english (Phase A)
// Ported verbatim from content/flows/phase_a_identity.yaml.

import type { QuestionModule, ValidationResult, MutateContext } from "../../types.ts";
import type { KeyboardIR } from "@keyboard-studio/contracts";

import { irPath } from "@keyboard-studio/contracts";

export const definition = {
  id: "language_name_english",
  prompt: "What is your language called in English?",
  help_text:
    "The English name used in directories and official language lists, for " +
    "example: Bafut, Swahili, Hindi. If your language does not have a " +
    "widely-used English name, repeat the name you gave above.",
  type: "text" as const,
  required: true,
  next: "iso_code",
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
    return { ok: false, code: "required", message: "English language name is required." };
  }
  return { ok: true };
}

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "Bafut", note: "simple ASCII name" },
    { value: "Swahili", note: "common English name" },
    { value: "  Hindi  ", note: "leading/trailing whitespace trimmed" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: "   ", expectedCode: "required", note: "whitespace-only" },
    { value: undefined, expectedCode: "required" },
  ],
};


/** Normalize the answer to a single trimmed string (text inputs may arrive as string[]). */
function asText(value: string | string[] | undefined): string {
  return typeof value === "string"
    ? value.trim()
    : Array.isArray(value)
      ? value.join("").trim()
      : "";
}

/**
 * Write the keyboard display name (the &NAME store) — spec-014 FR-006b.
 * Scoped to the declared `writes` path `header.name`. An empty answer produces
 * an empty patch (no-op), leaving the existing name untouched (M5).
 */
export function mutate(
  value: string | string[] | undefined,
  _ctx: MutateContext,
): Partial<KeyboardIR> {
  const name = asText(value);
  if (name === "") return {};
  return { header: { name } as KeyboardIR["header"] };
}

const mod: QuestionModule = {
  definition,
  validate,
  mutate,
  fixtures,
  inputs: [],
  writes: [irPath("header", "name")],
};
export default mod;

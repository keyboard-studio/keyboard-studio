// Per-question module: language_name_english (Phase A — PROPOSED flow)
//
// Mirrors the live IdentityLite English-name-first redesign (spec 030 FR-015):
// the English name is the FIRST identity question, an @langtags_names picker,
// and advances to the own-language name. The proposed Phase A flow is
// display-only (rendered as a graph in the Flow Map, not run live), so this
// module carries the same shape as its live counterpart il_language_english for
// consistency; no runtime resolver is wired for it.

import type { QuestionModule, ValidationResult, MutateContext } from "../../types.ts";
import type { KeyboardIR } from "@keyboard-studio/contracts";

import { irPath } from "@keyboard-studio/contracts";

export const definition = {
  id: "language_name_english",
  prompt: "What is your language called in English?",
  help_text:
    "Start typing your language's English name and pick it from the list " +
    "(for example: Bafut, Swahili, Hindi). When two languages share a name, " +
    "the list shows the region and local name so you can choose the right one. " +
    "If your language is not listed, just type its English name and continue.",
  type: "autocomplete" as const,
  options_source: "@langtags_names" as const,
  required: true,
  next: "language_name_autonym",
} satisfies import("../../types.ts").FlowQuestion;

export function validate(
  value: string | string[] | undefined,
): ValidationResult {
  if (asText(value).length === 0) {
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

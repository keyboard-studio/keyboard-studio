// Per-question module: pa_copyright_holder (Phase A)
// Ported verbatim from content/flows/phase_a_identity.yaml.
// maps_to: KeyboardIdentity.copyrightHolder

import type { QuestionModule, ValidationResult } from "../../types.ts";

import { irPath } from "@keyboard-studio/contracts";

export const definition = {
  id: "pa_copyright_holder",
  prompt: "Who holds the copyright for this keyboard?",
  label: "Copyright holder",
  help_text:
    "Name of the person or organization that holds the copyright for this " +
    "keyboard. This may be you, your employer, or a language organization. " +
    "Example: 'Bafut Language Committee'",
  type: "short_text" as const,
  required: true,
  next: "provenance_opt_in",
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
    return { ok: false, code: "required", message: "Copyright holder is required." };
  }
  return { ok: true };
}

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "Bafut Language Committee", note: "organization name" },
    { value: "SIL International", note: "org name" },
    { value: "  Jane Doe  ", note: "whitespace trimmed" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: "   ", expectedCode: "required", note: "whitespace-only" },
    { value: undefined, expectedCode: "required" },
  ],
};


const mod: QuestionModule = {
  definition,
  validate,
  fixtures,
  inputs: [],
  writes: [irPath("header", "copyright")],
};
export default mod;

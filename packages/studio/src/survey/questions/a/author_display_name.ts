// Per-question module: author_display_name (Phase A)
// Ported verbatim from content/flows/phase_a_identity.yaml.

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "author_display_name",
  prompt: "Who should be listed as the author of this keyboard?",
  help_text:
    "This name will appear in the keyboard package and in the public " +
    "keyboard repository. You can use a person's name, an organization " +
    "name, or a committee name, for example: Bafut Language Committee.",
  type: "text" as const,
  required: true,
  next: "author_contact_email",
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
    return { ok: false, code: "required", message: "Author name is required." };
  }
  return { ok: true };
}

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "Bafut Language Committee", note: "organization name" },
    { value: "Jane Doe", note: "person name" },
    { value: "  SIL International  ", note: "whitespace trimmed to non-empty" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: "   ", expectedCode: "required", note: "whitespace-only" },
    { value: undefined, expectedCode: "required" },
  ],
};


// writes: [] — author/publisher name populates KeyboardIdentity/.kps package metadata,
// which is outside KeyboardIR; it is not the keyboard's &NAME display name
// (that is language_name_english, which writes header.name).
const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;

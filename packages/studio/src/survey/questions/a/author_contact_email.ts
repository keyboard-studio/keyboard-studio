// Per-question module: author_contact_email (Phase A)
// Ported verbatim from content/flows/phase_a_identity.yaml.
//
// Validation note: the YAML marks this required: true and the prompt says "email
// address", but the YAML does not specify an email format rule — the help text
// says "Use an address that will remain active." A non-empty check is the minimal
// correct interpretation. A structural email check (contains @) is defensible but
// is slightly beyond what the YAML implies; flagged as uncertain in the report.

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "author_contact_email",
  prompt: "What email address can people use to contact the keyboard author?",
  help_text:
    "This address goes into the keyboard package so that users or " +
    "maintainers can reach the right person if they have questions. " +
    "Use an address that will remain active.",
  type: "text" as const,
  required: true,
  next: "pa_copyright_holder",
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
    return { ok: false, code: "required", message: "Contact email address is required." };
  }
  return { ok: true };
}

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "author@example.com", note: "standard email" },
    { value: "committee@languageorg.net", note: "org email" },
    { value: "  me@example.org  ", note: "whitespace trimmed" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: "   ", expectedCode: "required", note: "whitespace-only" },
    { value: undefined, expectedCode: "required" },
  ],
};


const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;

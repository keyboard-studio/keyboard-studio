// Per-question module: author_contact_email (Phase A)
// Ported verbatim from content/flows/phase_a_identity.yaml.
//
// Validation note: the YAML marks this required: true and the prompt says "email
// address". `format: "email"` (spec 059 follow-up) asks SurveyRunner's canAdvance
// for a basic structural check (local@domain.tld) on top of the non-empty check
// below — the two are independent: this module's own validate() only enforces
// required, since `format` is what actually reaches the live "Continue" gate
// (loadModularFlow's FlowDef carries `definition` only, not `validate`).

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
  format: "email",
  next: "pa_copyright_holder",
} satisfies import("../../types.ts").FlowQuestion;

export function validate(
  value: string | string[] | undefined,
): ValidationResult {
  const trimmed = typeof value === "string"
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

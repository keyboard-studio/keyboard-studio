// Per-question module: author_display_name (Phase A)
// Ported verbatim from content/flows/phase_a_identity.yaml.

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "author_display_name",
  // Neutral phrasing (spec 059 hand-off, km-domain finding on #1703): identity-lite
  // pre-fills this from the GitHub profile, but the field is legitimately blank on
  // resume (author override is preserved, not re-seeded — see IdentityLite.tsx's
  // getSeedValue), for guest users with no authorSeed, and for profiles with no
  // name (all covered by IdentityLite.attribution.test.tsx). A confirm-phrased
  // prompt ("Is this the right name...") is a non sequitur over an empty box in
  // those states, so this reads the same whether the field arrives filled or not.
  prompt: "Who should be credited as the author of this keyboard?",
  help_text:
    "This name will appear in the keyboard package and in the public " +
    "keyboard repository. Use the person or group who made the keyboard. " +
    "If an organisation holds the copyright, there is a separate question for that.",
  type: "text" as const,
  required: true,
  next: "author_contact_email",
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

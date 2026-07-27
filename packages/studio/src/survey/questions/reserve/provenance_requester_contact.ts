// Per-question module: provenance_requester_contact (Phase A — provenance)
// Ported verbatim from content/flows/phase_a_identity.yaml.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "provenance_requester_contact",
  prompt: "Your email or other contact information",
  help_text:
    "An email address where reviewers can reach you if they have questions " +
    "about this request.",
  type: "text" as const,
  required: false,
  next: "provenance_requester_affiliation",
} satisfies import("../../types.ts").FlowQuestion;

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "requester@example.com", note: "email address" },
    { value: "WhatsApp: +1-555-1234", note: "alternative contact" },
    { value: undefined, note: "optional — blank is allowed" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

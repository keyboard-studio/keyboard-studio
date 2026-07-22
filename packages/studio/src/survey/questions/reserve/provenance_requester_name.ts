// Per-question module: provenance_requester_name (Phase A — provenance)
// Ported verbatim from content/flows/phase_a_identity.yaml.
// All provenance questions are required: false; no validate().

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "provenance_requester_name",
  prompt: "Your full name (the person filling in this form)",
  help_text:
    "This is used for contact purposes only, not as the keyboard author credit.",
  type: "text" as const,
  required: false,
  next: "provenance_requester_contact",
} satisfies import("../../types.ts").FlowQuestion;

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "Jane Doe", note: "typical full name" },
    { value: "张伟", note: "non-ASCII name" },
    { value: undefined, note: "optional — blank is allowed" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

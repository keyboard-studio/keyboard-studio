// Per-question module: provenance_community_rep_role (Phase A — provenance)
// Ported verbatim from content/flows/phase_a_identity.yaml.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "provenance_community_rep_role",
  prompt: "That person's role in the community",
  help_text:
    "For example: language committee chair, village elder, literacy teacher.",
  type: "text" as const,
  required: false,
  next: "provenance_community_rep_email",
} satisfies import("../../types.ts").FlowQuestion;

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "language committee chair", note: "typical role" },
    { value: "literacy teacher", note: "another common role" },
    { value: undefined, note: "optional — blank is allowed" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

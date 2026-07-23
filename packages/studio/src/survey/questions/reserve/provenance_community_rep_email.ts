// Per-question module: provenance_community_rep_email (Phase A — provenance)
// Ported verbatim from content/flows/phase_a_identity.yaml.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "provenance_community_rep_email",
  prompt: "That person's email address",
  help_text:
    "So reviewers can follow up directly with the community if needed.",
  type: "text" as const,
  required: false,
  next: "provenance_speaker_count",
} satisfies import("../../types.ts").FlowQuestion;

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "rep@community.org", note: "email address" },
    { value: "commrep@example.net", note: "another email" },
    { value: undefined, note: "optional — blank is allowed" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

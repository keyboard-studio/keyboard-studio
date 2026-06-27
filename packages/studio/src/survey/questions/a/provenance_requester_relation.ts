// Per-question module: provenance_requester_relation (Phase A — provenance)
// Ported verbatim from content/flows/phase_a_identity.yaml.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "provenance_requester_relation",
  prompt: "What is your relationship to the language community?",
  help_text:
    "For example: mother-tongue speaker, linguist working with the community, " +
    "language committee member.",
  type: "text" as const,
  required: false,
  next: "provenance_community_rep_name",
} satisfies import("../../types.ts").FlowQuestion;

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "mother-tongue speaker", note: "native speaker" },
    { value: "linguist working with the community", note: "external linguist" },
    { value: undefined, note: "optional — blank is allowed" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

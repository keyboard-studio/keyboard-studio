// Per-question module: provenance_requester_affiliation (Phase A — provenance)
// Ported verbatim from content/flows/phase_a_identity.yaml.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "provenance_requester_affiliation",
  prompt: "Your organization or affiliation (if any)",
  help_text:
    "For example: SIL International, a university, or a language committee.",
  type: "text" as const,
  required: false,
  next: "provenance_requester_relation",
} satisfies import("../../types.ts").FlowQuestion;

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "SIL International", note: "known org" },
    { value: "University of Lagos", note: "academic affiliation" },
    { value: undefined, note: "optional — blank is allowed" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

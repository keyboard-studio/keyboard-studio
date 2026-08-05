// Per-question module: provenance_community_involvement (Phase A — provenance)
// Ported verbatim from content/flows/phase_a_identity.yaml.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "provenance_community_involvement",
  prompt: "How should the language community be involved in testing this keyboard?",
  help_text:
    "For example: the language committee will review a draft before release, " +
    "or a group of teachers will test-type sample texts. Leave blank if " +
    "community testing is not planned.",
  type: "text" as const,
  required: false,
  next: "provenance_casing_notes",
} satisfies import("../../types.ts").FlowQuestion;

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "Language committee will review a draft before release", note: "committee review" },
    { value: "Teachers will test-type sample texts", note: "classroom testing" },
    { value: undefined, note: "optional — blank is allowed" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

// Per-question module: provenance_community_rep_name (Phase A — provenance)
// Ported verbatim from content/flows/phase_a_identity.yaml.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "provenance_community_rep_name",
  prompt: "Name of a language community representative (if known)",
  help_text:
    "Someone from the language community who can confirm that this keyboard " +
    "meets the community's needs. Leave blank if not applicable.",
  type: "text" as const,
  required: false,
  next: "provenance_community_rep_role",
} satisfies import("../../types.ts").FlowQuestion;

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "Elder Moses Fon", note: "community representative name" },
    { value: "Dr. Amara Keita", note: "title + name" },
    { value: undefined, note: "optional — blank is allowed" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

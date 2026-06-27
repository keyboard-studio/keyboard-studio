// Per-question module: provenance_language_status (Phase A — provenance)
// Ported verbatim from content/flows/phase_a_identity.yaml.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "provenance_language_status",
  prompt: "How actively is the language used today?",
  help_text:
    "Describe the vitality of the language in plain terms, for example: " +
    "\"Spoken daily by all generations\" (EGIDS 6a vigorous), \"Used by older " +
    "adults but children prefer the national language\" (EGIDS 7 shifting), " +
    "or \"Endangered, fewer than 100 speakers remain\" (EGIDS 8b). An " +
    "approximate description is fine.",
  type: "text" as const,
  required: false,
  next: "provenance_existing_tools",
} satisfies import("../../types.ts").FlowQuestion;

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "Spoken daily by all generations", note: "vigorous language" },
    { value: "Used by older adults but children prefer the national language", note: "shifting language" },
    { value: undefined, note: "optional — blank is allowed" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

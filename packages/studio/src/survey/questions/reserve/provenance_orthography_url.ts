// Per-question module: provenance_orthography_url (Phase A — provenance)
// Ported verbatim from content/flows/phase_a_identity.yaml.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "provenance_orthography_url",
  prompt: "Is there a published description of how this language is written?",
  help_text:
    "If there is a published alphabet guide, orthography document, or " +
    "writing-system description online, paste its web address here. " +
    "This helps the studio find the right characters for Phase B.",
  type: "text" as const,
  required: false,
  next: "provenance_community_involvement",
} satisfies import("../../types.ts").FlowQuestion;

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "https://example.org/bafut-orthography.pdf", note: "URL to published guide" },
    { value: "https://sil.org/languages/bfd", note: "SIL language page" },
    { value: undefined, note: "optional — blank is allowed" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

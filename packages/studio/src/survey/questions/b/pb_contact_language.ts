// Per-question module: pb_contact_language (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.
// Advisory question (advisory: true).

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pb_contact_language",
  prompt:
    "Are there common borrowed words, people's names, or website addresses that the keyboard must also be able to type?",
  help_text:
    "For example, if French loanwords are common, the keyboard should still " +
    "be able to produce those letters without extra steps. Website addresses " +
    "and place names borrowed from other languages also count. List any " +
    "characters or words from other languages that speakers regularly need, " +
    "or leave blank if there are none.",
  type: "text" as const,
  required: false,
  advisory: true,
  next: "pb_legacy_encoding",
} satisfies import("../../types.ts").FlowQuestion;

// No validation: advisory free-text.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "French loanwords: école, café", note: "French contact language" },
    { value: "", note: "blank is fine (advisory)" },
    { value: undefined, note: "undefined is fine (advisory)" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

// Per-question module: pb_use_case (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.
// Advisory question (advisory: true).

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pb_use_case",
  prompt:
    "What will this keyboard mainly be used for — school materials, everyday texting, or official documents?",
  help_text:
    "School and literacy materials often need every character to be easy " +
    "to reach without extra steps. Texting keyboards can put less common " +
    "characters behind a long press. Official and government documents may " +
    "need a more complete character set. Your answer helps the studio " +
    "suggest the best balance between ease of use and completeness.",
  type: "radio" as const,
  required: false,
  advisory: true,
  options: [
    {
      value: "literacy",
      label: "School or literacy materials (every character should be quick to reach)",
    },
    {
      value: "messaging",
      label: "Everyday texting and messaging (speed and common letters matter most)",
    },
    {
      value: "official",
      label: "Official or government documents (completeness matters most)",
    },
    {
      value: "general",
      label: "General use -- a mix of the above",
    },
  ],
  next: "pb_additional_methods",
} satisfies import("../../types.ts").FlowQuestion;

// No validation: required: false advisory question.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "literacy", note: "literacy / school use" },
    { value: "messaging", note: "everyday texting" },
    { value: "official", note: "official documents" },
    { value: "general", note: "general use" },
    { value: undefined, note: "optional — blank is fine" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

// Per-question module: pf_contact_info (Phase F)
// Ported verbatim from content/flows/phase_f_helpdocs.yaml.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pf_contact_info",
  prompt: "Is there a public contact for the language community? (optional)",
  help_text:
    "An email address, website, or social media handle where people can reach " +
    "the language community. This appears at the end of the help page so users " +
    "can ask questions or report problems. Leave blank to omit it.",
  type: "text" as const,
  required: false,
  next: null,
} satisfies import("../../types.ts").FlowQuestion;

// No validation: required: false; free-text contact info.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    {
      value: "info@bafutliteracy.org",
      note: "email contact",
    },
    {
      value: "https://bafutliteracy.org/contact",
      note: "website contact",
    },
    { value: "", note: "blank is fine (optional)" },
    { value: undefined, note: "undefined is fine (optional)" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

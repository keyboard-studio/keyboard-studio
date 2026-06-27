// Per-question module: pf_credits (Phase F)
// Ported verbatim from content/flows/phase_f_helpdocs.yaml.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pf_credits",
  prompt: "Who should be acknowledged for creating this keyboard?",
  help_text:
    "List the people, organizations, or committees who worked on the keyboard. " +
    "You can include names, roles, or organizations. For example: \"Bafut " +
    "Language Committee, Northwest Region, Cameroon. Keyboard layout by the " +
    "Bafut Literacy Project.\" Do not include a copyright symbol or year — " +
    "those are captured separately. This appears in the credits section of " +
    "the help page.",
  type: "text" as const,
  required: false,
  next: "pf_contact_info",
} satisfies import("../../types.ts").FlowQuestion;

// No validation: required: false; free-text credits.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    {
      value:
        "Bafut Language Committee, Northwest Region, Cameroon. Keyboard layout by the Bafut Literacy Project.",
      note: "canonical example from YAML",
    },
    { value: "SIL International", note: "organization only" },
    { value: "", note: "blank is fine (optional)" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

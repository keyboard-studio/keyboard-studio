// Per-question module: provenance_opt_in (Phase A)
// Ported verbatim from content/flows/phase_a_identity.yaml.
// Gates entry into the provenance_questions list.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "provenance_opt_in",
  prompt: "Would you like to provide additional background about your language community?",
  help_text:
    "This optional section collects context about who is requesting the " +
    "keyboard and the language community it serves. None of it is required, " +
    "and none of it affects how the keyboard is built. It helps reviewers " +
    "understand the project.",
  type: "bool" as const,
  required: false,
  next: [
    { condition: "value == 'true'", goto: "provenance_requester_name" },
    { default: true as const, goto: null },
  ],
} satisfies import("../../types.ts").FlowQuestion;

// No validate() — optional bool gate.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "true", note: "opts in to provenance section" },
    { value: "false", note: "skips provenance section" },
    { value: undefined, note: "optional — blank skips provenance" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

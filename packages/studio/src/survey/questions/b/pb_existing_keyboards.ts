// Per-question module: pb_existing_keyboards (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pb_existing_keyboards",
  prompt:
    "What do people in your language community use today to type — a standard keyboard meant for another language, an older Keyman keyboard, or some other workaround?",
  help_text:
    "For example: a national keyboard designed for a neighboring language, " +
    "an older Keyman keyboard the community already uses, or a workaround " +
    "like typing two letters for one sound. Knowing their existing habits " +
    "lets the studio suggest key positions that feel familiar and are more " +
    "likely to be adopted.",
  type: "text" as const,
  required: false,
  next: "pb_co_installed_keyboards",
} satisfies import("../../types.ts").FlowQuestion;

// No validation rule: required: false, free-text advisory.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "French AZERTY keyboard", note: "typical advisory answer" },
    { value: "", note: "blank is fine (not required)" },
    { value: undefined, note: "undefined is fine (not required)" },
  ],
  invalid: [],
};

const mod: QuestionModule = { definition, fixtures };
export default mod;

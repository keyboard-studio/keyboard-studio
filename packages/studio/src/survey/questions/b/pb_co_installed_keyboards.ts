// Per-question module: pb_co_installed_keyboards (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pb_co_installed_keyboards",
  prompt:
    "Are there other keyboards that must keep working on the same device — for example, a French, English, Arabic, or Devanagari keyboard for a different language?",
  help_text:
    "If your users switch between keyboards on the same computer or phone, " +
    "this keyboard should not accidentally block or change key combinations " +
    "that the other keyboard uses. List any keyboards that your community " +
    "switches between regularly, or leave blank if there are none.",
  type: "text" as const,
  required: false,
  next: "pb_discovery_intro",
} satisfies import("../../types.ts").FlowQuestion;

// No validation rule: required: false, free-text advisory.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "French AZERTY, English US", note: "typical advisory answer" },
    { value: "", note: "blank is fine (not required)" },
    { value: undefined, note: "undefined is fine (not required)" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

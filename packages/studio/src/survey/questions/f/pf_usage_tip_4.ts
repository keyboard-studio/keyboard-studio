// Per-question module: pf_usage_tip_4 (Phase F)
// Ported verbatim from content/flows/phase_f_helpdocs.yaml.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pf_usage_tip_4",
  prompt: "Add a fourth usage tip (optional)",
  help_text: "Another short tip. Leave blank when done.",
  type: "text" as const,
  required: false,
  next: "pf_usage_tip_5",
} satisfies import("../../types.ts").FlowQuestion;

// No validation: required: false; optional tip.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "Press Ctrl+Z to undo if you accidentally overwrite a character.", note: "fourth tip" },
    { value: "", note: "blank is fine (optional)" },
    { value: undefined, note: "undefined is fine (optional)" },
  ],
  invalid: [],
};


export const inputs: readonly import("@keyboard-studio/contracts").IRPath[] = [];
export const writes: readonly import("@keyboard-studio/contracts").IRPath[] = [];
const mod: QuestionModule = { definition, fixtures, inputs, writes };
export default mod;

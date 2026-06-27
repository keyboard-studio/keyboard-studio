// Per-question module: pf_usage_tip_5 (Phase F)
// Ported verbatim from content/flows/phase_f_helpdocs.yaml.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pf_usage_tip_5",
  prompt: "Add a fifth usage tip (optional)",
  help_text: "Another short tip. Leave blank when done.",
  type: "text" as const,
  required: false,
  next: "pf_credits",
} satisfies import("../../types.ts").FlowQuestion;

// No validation: required: false; optional tip.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "Visit the project website for a printable keyboard chart.", note: "fifth tip" },
    { value: "", note: "blank is fine (optional)" },
    { value: undefined, note: "undefined is fine (optional)" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

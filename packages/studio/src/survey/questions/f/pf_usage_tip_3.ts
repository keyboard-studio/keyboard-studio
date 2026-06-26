// Per-question module: pf_usage_tip_3 (Phase F)
// Ported verbatim from content/flows/phase_f_helpdocs.yaml.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pf_usage_tip_3",
  prompt: "Add a third usage tip (optional)",
  help_text: "Another short tip. Leave blank when done.",
  type: "text" as const,
  required: false,
  next: "pf_usage_tip_4",
} satisfies import("../../types.ts").FlowQuestion;

// No validation: required: false; optional tip.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "The special characters can also be accessed from the on-screen keyboard.", note: "third tip" },
    { value: "", note: "blank is fine (optional)" },
    { value: undefined, note: "undefined is fine (optional)" },
  ],
  invalid: [],
};


export const inputs: readonly import("@keyboard-studio/contracts").IRPath[] = [];
export const writes: readonly import("@keyboard-studio/contracts").IRPath[] = [];
const mod: QuestionModule = { definition, fixtures, inputs, writes };
export default mod;

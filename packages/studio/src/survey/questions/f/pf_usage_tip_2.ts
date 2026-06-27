// Per-question module: pf_usage_tip_2 (Phase F)
// Ported verbatim from content/flows/phase_f_helpdocs.yaml.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pf_usage_tip_2",
  prompt: "Add a second usage tip (optional)",
  help_text:
    "Another short tip about how to use the keyboard. Leave blank if one tip " +
    "is enough.",
  type: "text" as const,
  required: false,
  next: "pf_usage_tip_3",
} satisfies import("../../types.ts").FlowQuestion;

// No validation: required: false; optional tip.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "To type a capital accented letter, hold Shift while pressing the accented key.", note: "second tip" },
    { value: "", note: "blank is fine (optional)" },
    { value: undefined, note: "undefined is fine (optional)" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

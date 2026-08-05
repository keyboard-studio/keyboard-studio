// Per-question module: pf_usage_tip_2 (Phase F)
// Ported verbatim from content/flows/phase_f_helpdocs.yaml.
//
// ROUTING CHANGE (Phase F revisions): next was "pf_usage_tip_3".
// Tips 3-5 are demoted out of the live flow membership (see
// content/flows/phase_f_helpdocs.modular.yaml) because a fixed five required
// tip slots fit neither end of the shipped corpus — 54% of help pages are one
// paragraph, while complex-script keyboards document 14-30 rule sections.
// Tips 3-5 remain registered, on disk, and test-covered so re-adding their ids
// to the YAML revives them (repo convention: demotion is not deletion).
//
// This second tip now sits INSIDE the opt-in battery, past pf_more_detail_gate —
// the default path asks for at most one tip.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pf_usage_tip_2",
  prompt: "Add a second usage tip (optional)",
  help_text:
    "Another short tip about how to use the keyboard. Leave blank if one tip " +
    "is enough.",
  type: "text" as const,
  required: false,
  next: "pf_scope_variety",
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

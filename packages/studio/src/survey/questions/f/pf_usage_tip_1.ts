// Per-question module: pf_usage_tip_1 (Phase F)
// Ported verbatim from content/flows/phase_f_helpdocs.yaml.
//
// NOW OPTIONAL (Phase F minimum-questions revision). This was required, which
// forced every author to write a tip even when they had nothing to add — and a
// filler tip on a help page is worse than no tip. 54% of published help pages
// are a single prose paragraph plus an auto-rendered layout chart, which is a
// legitimate shipped shape. validate() was removed with the required flag.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pf_usage_tip_1",
  prompt: "Is there anything users need to know to type with this keyboard? (optional)",
  help_text:
    "One short tip, if you have one — for example how to type a character that " +
    "is not obvious, or a key combination for a common accent mark. The keyboard " +
    "layout diagram and the list of key sequences are generated automatically " +
    "from your keyboard, so use this space only for what a diagram cannot show: " +
    "the thing users get wrong, or the reason a sequence works the way it does. " +
    "Leave it blank if the layout speaks for itself.",
  type: "text" as const,
  required: false,
  next: "pf_more_detail_gate",
} satisfies import("../../types.ts").FlowQuestion;

// No validation: required: false; optional tip.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    {
      value: "Press the backtick key (`) followed by a vowel to add a grave accent.",
      note: "dead-key tip",
    },
    {
      value: "Use AltGr + e to type é.",
      note: "AltGr tip",
    },
    { value: "", note: "blank is fine — the layout speaks for itself" },
    { value: undefined, note: "undefined is fine (optional)" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

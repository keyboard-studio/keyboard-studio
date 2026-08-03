// Per-question module: pf_known_limitations (Phase F)
//
// NEW (Phase F documentation revision). Honest caveats appear in the better help
// pages and are pure authorial knowledge — no validator or rule set can state
// them. release/t/thamizha_tamil99_ext, next to one character: "This character is
// entered by typing T. Currently, some browsers do not display this character
// correctly."

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pf_known_limitations",
  prompt: "Is there anything that does not work yet, or works imperfectly? (optional)",
  help_text:
    "Say plainly what is incomplete, untested, or known to render badly in some " +
    "places. Users trust documentation that admits limits, and it saves them " +
    "reporting problems you already know about. For example: \"Some browsers do " +
    "not display the aytham character correctly.\" Or: \"The mobile layout has " +
    "not been tested on tablets.\"",
  type: "text" as const,
  required: false,
  next: "pf_further_reading",
} satisfies import("../../types.ts").FlowQuestion;

// No validation: required: false; free-text limitations.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    {
      value: "Some browsers do not display this character correctly.",
      note: "rendering caveat (thamizha_tamil99_ext pattern)",
    },
    {
      value: "The mobile layout has not been tested on tablets.",
      note: "untested-surface caveat",
    },
    { value: "", note: "blank is fine (optional)" },
    { value: undefined, note: "undefined is fine (optional)" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

// Per-question module: pb_picker_confirm (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pb_picker_confirm",
  prompt: "Tick every character your language uses.",
  help_text:
    "The grid shows characters common in your script, with characters your " +
    "language is known to use highlighted at the top. Tick each one you need. " +
    "Characters your base keyboard already produces are shown greyed out -- " +
    "you can still tick them if you want to confirm them explicitly. When " +
    "done, click Continue. You can combine this with the step-by-step " +
    "questions to catch anything the grid did not include.",
  type: "multi_select" as const,
  options_source: "@picker_candidates_seeded",
  required: false,
  next: "pb_routing_branch",
} satisfies import("../../types.ts").FlowQuestion;

// No validation: required: false; UI ensures picker produces an array or empty.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    {
      value: ["U+0301", "U+0300"],
      note: "two codepoints selected from picker",
    },
    { value: [], note: "empty selection (not required)" },
    { value: undefined, note: "undefined (not required)" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

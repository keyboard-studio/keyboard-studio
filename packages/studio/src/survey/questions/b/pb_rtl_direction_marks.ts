// Per-question module: pb_rtl_direction_marks (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.
// Advisory question (advisory: true).

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pb_rtl_direction_marks",
  prompt:
    "Does your keyboard need to produce special invisible characters to keep numbers or left-to-right words in the correct order inside right-to-left text?",
  help_text:
    "When right-to-left text contains a number, a web address, or a " +
    "word from a left-to-right language, an invisible direction-control " +
    "character sometimes helps the computer display it in the right " +
    "order. These characters are not part of your written language but " +
    "help with mixed-direction text. Most users do not need a dedicated " +
    "key for them. Answer Yes only if your community regularly types " +
    "mixed content where automatic direction handling fails. (Note: the " +
    "studio will configure this in a later step if you answer Yes.)",
  type: "bool" as const,
  required: false,
  advisory: true,
  next: [
    { condition: "value == 'true'", goto: "pb_rtl_direction_marks_detail" },
    { default: true, goto: "pb_rtl_special_letters" },
  ],
} satisfies import("../../types.ts").FlowQuestion;

// No validation: required: false advisory question.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "true", note: "needs direction-control characters" },
    { value: "false", note: "no direction-control characters needed" },
    { value: undefined, note: "optional — blank routes to default" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

// Per-question module: pb_rtl_direction_marks_detail (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.
// Advisory question (advisory: true).

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pb_rtl_direction_marks_detail",
  prompt:
    "Which direction-control characters do you need? (the studio will place these in a later step)",
  help_text:
    "Select whichever you need. The Right-to-Left Mark (RLM, U+200F) and " +
    "Left-to-Right Mark (LRM, U+200E) are invisible characters that nudge " +
    "the Unicode bidi algorithm when punctuation or spaces sit at a script " +
    "boundary -- for example, keeping a period or parenthesis on the correct " +
    "side of a mixed Arabic-Latin phrase. They do not force a paragraph " +
    "direction; use them when a neutral character (space, punctuation) is " +
    "resolving in the wrong direction at a script junction.",
  type: "multi_select" as const,
  required: false,
  advisory: true,
  options: [
    {
      value: "U+200F",
      label:
        "Right-to-Left Mark (RLM) -- bidi hint that resolves adjacent neutral characters as right-to-left",
    },
    {
      value: "U+200E",
      label:
        "Left-to-Right Mark (LRM) -- bidi hint that resolves adjacent neutral characters as left-to-right",
    },
  ],
  next: "pb_rtl_special_letters",
} satisfies import("../../types.ts").FlowQuestion;

// No validation: required: false advisory multi_select.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: ["U+200F"], note: "RLM only" },
    { value: ["U+200E"], note: "LRM only" },
    { value: ["U+200F", "U+200E"], note: "both direction marks" },
    { value: [], note: "empty selection (optional)" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

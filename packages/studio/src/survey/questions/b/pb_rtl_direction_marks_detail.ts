// Per-question module: pb_rtl_direction_marks_detail (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.
// Advisory question (advisory: true).

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pb_rtl_direction_marks_detail",
  prompt:
    "Which direction-control characters do you need? (the studio will place these in a later step)",
  help_text:
    "Select whichever you need. The Right-to-Left Mark forces " +
    "right-to-left reading order on surrounding text; the Left-to-Right " +
    "Mark forces left-to-right reading order. Both are invisible when " +
    "typed. The studio will suggest a key position for these in a later " +
    "step.",
  type: "multi_select" as const,
  required: false,
  advisory: true,
  options: [
    {
      value: "U+200F",
      label:
        "Right-to-Left Mark -- forces right-to-left direction on surrounding text",
    },
    {
      value: "U+200E",
      label:
        "Left-to-Right Mark -- forces left-to-right direction on surrounding text",
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

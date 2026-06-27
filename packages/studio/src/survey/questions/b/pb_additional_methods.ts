// Per-question module: pb_additional_methods (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pb_additional_methods",
  prompt: "Would you like to add characters using any other method before finishing?",
  help_text:
    "You can use more than one method to build your character list. Pasting " +
    "a text sample, reviewing the linguist-suggested list, or browsing the " +
    "character grid can all fill in characters the questions above may have " +
    "missed. All methods feed the same confirmed list. Choose one to continue, " +
    "or choose Done to go straight to review.",
  type: "radio" as const,
  required: false,
  options: [
    { value: "text-sample", label: "Paste a text sample" },
    {
      value: "linguist",
      label: "Review the suggested list for {{language_name}}",
    },
    { value: "picker", label: "Browse the character grid" },
    { value: "done", label: "Done -- go straight to the review" },
  ],
  next: [
    { condition: "value == 'text-sample'", goto: "pb_text_sample" },
    { condition: "value == 'linguist'", goto: "pb_linguist_confirm" },
    { condition: "value == 'picker'", goto: "pb_picker_confirm" },
    { default: true, goto: null },
  ],
} satisfies import("../../types.ts").FlowQuestion;

// No validation: required: false; null goto terminates the phase.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "text-sample", note: "loop back for text sample" },
    { value: "linguist", note: "loop back for linguist list" },
    { value: "picker", note: "loop back for picker" },
    { value: "done", note: "terminate phase" },
    { value: undefined, note: "optional — blank terminates phase" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

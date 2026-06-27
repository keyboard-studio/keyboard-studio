// Per-question module: pb_latin_digraphs_list (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pb_latin_digraphs_list",
  prompt:
    "List the letter combinations (digraphs and multigraphs) your language treats as single sounds.",
  help_text:
    "Type each letter combination separated by spaces, for example: sh ts ny " +
    "ng ch ngh. Include both lowercase and uppercase forms if the uppercase " +
    "version differs from simply capitalizing each letter. The studio " +
    "uses this to decide whether to give each digraph or multigraph its own key.",
  type: "text" as const,
  required: false,
  next: "pb_punctuation_gate",
} satisfies import("../../types.ts").FlowQuestion;

// No validation: required: false; free-text list.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "sh ts ny ng", note: "typical digraph list" },
    { value: "ngh", note: "Welsh trigraph" },
    { value: "", note: "blank is fine (not required)" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

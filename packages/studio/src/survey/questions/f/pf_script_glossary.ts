// Per-question module: pf_script_glossary (Phase F)
//
// NEW (Phase F documentation revision). Reached only on the non-roman branch.
// Shipped help pages freely use script-specific terminology with no gloss —
// chillu, chandrakkala, anusvara, pulli, aytham, coeng, dagesh, repha, halant,
// the Ge'ez/sadis orders, saltillo, Manuel de Codage — and an undefined term
// makes a whole section unreadable to a learner. Only the author can supply the
// definitions.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pf_script_glossary",
  prompt:
    "Are there special terms a reader would need explained? (optional)",
  help_text:
    "If your documentation uses names for marks, letter classes, or writing " +
    "conventions that a learner or an outsider would not know, define them here " +
    "in plain language — one per line, as \"term: meaning\". Help pages often " +
    "assume these terms and become unreadable without them. For example: " +
    "\"pulli: the dot that removes a consonant's built-in vowel\" or \"coeng: " +
    "the mark that stacks one consonant beneath another\".",
  type: "text" as const,
  required: false,
  next: "pf_example_words",
} satisfies import("../../types.ts").FlowQuestion;

// No validation: required: false; free-text glossary lines.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    {
      value:
        "pulli: the dot that removes a consonant's built-in vowel\naytham: the letter used for the aspirated sound",
      note: "two term/definition lines (thamizha_tamil99_ext vocabulary)",
    },
    {
      value: "coeng: the mark that stacks one consonant beneath another",
      note: "single term (khmer_angkor vocabulary)",
    },
    { value: "", note: "blank is fine (optional)" },
    { value: undefined, note: "undefined is fine (optional)" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

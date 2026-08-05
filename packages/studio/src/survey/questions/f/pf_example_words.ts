// Per-question module: pf_example_words (Phase F)
//
// NEW (Phase F documentation revision). 190 shipped .kps files carry an
// <Examples> element, e.g. release/b/breton_chwerty/source/breton_chwerty.kps:
//   <Example ID="fr" Keys="F r q n 9 q i s" Text="Francais" Note="Name of Language"/>
//
// The KEYSTROKES are computable by searching the rules for the target string, so
// this question deliberately does not ask for them — only for the word choice and
// what it means, which are editorial. release/gff/gff_amharic showcases a
// greeting; breton_chwerty picks the language's own name.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pf_example_words",
  prompt: "Give two or three example words to showcase, with their meanings. (optional)",
  help_text:
    "Pick words that show off the characters this keyboard exists for — the ones " +
    "a user is most likely to want to type first. Good choices are the language's " +
    "own name, a common greeting, or a word using the trickiest mark. Write one " +
    "per line as \"word - what it means\". The key sequence for each word is " +
    "worked out automatically, so you do not need to list keystrokes. For " +
    "example: \"Bafut - name of the language\" or \"tenayistilign - a greeting\".",
  type: "text" as const,
  required: false,
  next: "pf_troubleshooting",
} satisfies import("../../types.ts").FlowQuestion;

// No validation: required: false; free-text example lines.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    {
      value: "Bafut - name of the language\nmbe'e - goat",
      note: "language name plus a word with a special mark",
    },
    {
      value: "tenayistilign - a greeting",
      note: "greeting showcase (gff_amharic pattern)",
    },
    { value: "", note: "blank is fine (optional)" },
    { value: undefined, note: "undefined is fine (optional)" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

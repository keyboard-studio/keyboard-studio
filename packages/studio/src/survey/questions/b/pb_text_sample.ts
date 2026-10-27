// Per-question module: pb_text_sample (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.

import type { QuestionModule } from "../../types.ts";
import { makeRequiredTextValidator } from "../validators.ts";

export const definition = {
  id: "pb_text_sample",
  prompt: "Paste a paragraph or more of text written in your language.",
  help_text:
    "The longer the text, the better. Anything works: a story, a Bible " +
    "passage, a news article, or even a short sentence. We will find every " +
    "distinct character and build your character list from it. You can still " +
    "review and edit the list after. Please paste at least one full sentence. " +
    "Paste a representative sample -- the studio normalizes it to standard Unicode form (NFC) before analysis.",
  type: "text" as const,
  required: true,
  next: "pb_text_sample_review",
} satisfies import("../../types.ts").FlowQuestion;

export const validate = makeRequiredTextValidator("Please paste at least one sentence of text.");

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "Ndap mi nɛ́ faʼ.", note: "short Bafut sentence" },
    {
      value:
        "In the beginning God created the heavens and the earth.",
      note: "English sample",
    },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: "   ", expectedCode: "required", note: "whitespace only" },
    { value: undefined, expectedCode: "required" },
  ],
};


const mod: QuestionModule = {
  definition,
  validate,
  fixtures,
  inputs: [],
  writes: [],
  specRef: "specs/050-text-sample-prefill",
  provides: ["text-sample"], requires: ["discovery-intro"],
};
export default mod;

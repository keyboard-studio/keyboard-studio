// Per-question module: pb_legacy_encoding (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.
// Advisory question (advisory: true).

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pb_legacy_encoding",
  prompt:
    "Does existing text in your language come from older systems where the keyboard used a non-standard character set — sometimes called a 'legacy encoding' — rather than the international Unicode standard?",
  help_text:
    "Some older documents were produced with keyboards that stored " +
    "characters using a private or non-standard system (sometimes called a " +
    "'legacy font' or 'legacy encoding'). These documents may look correct " +
    "on screen but store characters differently from modern software. If " +
    "your community has documents like this, the studio can warn you about " +
    "compatibility before the keyboard is finished.",
  type: "radio" as const,
  required: false,
  advisory: true,
  options: [
    {
      value: "yes-legacy",
      label: "Yes, some existing text uses a legacy encoding or legacy font",
    },
    {
      value: "no-unicode",
      label: "No, existing text already uses the international Unicode standard",
    },
    {
      value: "not-sure",
      label: "I am not sure",
    },
  ],
  next: "pb_use_case",
} satisfies import("../../types.ts").FlowQuestion;

// No validation: required: false advisory question.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "yes-legacy", note: "legacy encoding in use" },
    { value: "no-unicode", note: "Unicode only" },
    { value: "not-sure", note: "unsure" },
    { value: undefined, note: "optional — blank is fine" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

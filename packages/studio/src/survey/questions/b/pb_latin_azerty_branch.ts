// Per-question module: pb_latin_azerty_branch (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.
// Shown when routing_group == "azerty".

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pb_latin_azerty_branch",
  prompt:
    "On a standard French AZERTY keyboard, digits require the Shift key (unshifted keys give symbols like & and @). Should your keyboard keep this layout or make digits easier to reach without Shift?",
  help_text:
    "Standard French AZERTY puts special characters on the unshifted number " +
    "row (for example, unshifted 1 gives the & sign) and digits require Shift " +
    "to type. Many African-language keyboards on an AZERTY base change this " +
    "so digits are typed without Shift. Choose whichever you prefer for your " +
    "community.",
  type: "radio" as const,
  required: false,
  options: [
    {
      value: "keep-french",
      label: "Keep the standard French layout (digits need Shift)",
    },
    {
      value: "digits-unshifted",
      label: "Make digits available without Shift (symbols moved elsewhere)",
    },
    {
      value: "no-preference",
      label: "No strong preference",
    },
  ],
  next: "pb_azerty_qz_swap",
} satisfies import("../../types.ts").FlowQuestion;

// No validation: required: false advisory question.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "keep-french", note: "keep standard French digit layout" },
    { value: "digits-unshifted", note: "make digits unshifted (common for African AZERTY)" },
    { value: "no-preference", note: "no preference" },
    { value: undefined, note: "optional — blank is fine" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

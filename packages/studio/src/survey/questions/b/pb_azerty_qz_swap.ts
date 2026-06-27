// Per-question module: pb_azerty_qz_swap (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pb_azerty_qz_swap",
  prompt:
    "Does your language use both the Q sound and the A sound, and both the W sound and the Z sound, as separate letters?",
  help_text:
    "On a French AZERTY keyboard the Q and A keys are swapped compared to " +
    "QWERTY (A is where Q is on QWERTY), and W and Z are also swapped. If " +
    "your language uses both Q and A as separate letters, it may make sense " +
    "to follow QWERTY positions instead. This is a layout decision for your " +
    "community.",
  type: "radio" as const,
  required: false,
  options: [
    {
      value: "follow-azerty",
      label:
        "Follow AZERTY positions (A where QWERTY has Q, Z where QWERTY has W)",
    },
    {
      value: "follow-qwerty",
      label: "Follow QWERTY positions (Q and A in standard QWERTY spots)",
    },
    {
      value: "no-preference",
      label: "No preference or not applicable",
    },
  ],
  next: "pb_spare_keys_azerty",
} satisfies import("../../types.ts").FlowQuestion;

// No validation: required: false advisory question.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "follow-azerty", note: "keep AZERTY swap" },
    { value: "follow-qwerty", note: "use QWERTY positions" },
    { value: "no-preference", note: "no preference" },
    { value: undefined, note: "optional — blank is fine" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

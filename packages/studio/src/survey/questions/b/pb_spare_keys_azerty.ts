// Per-question module: pb_spare_keys_azerty (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pb_spare_keys_azerty",
  prompt:
    "Are there any keys on the AZERTY keyboard that your language does not need, and that could be used for extra characters?",
  help_text:
    "For example, some languages do not need the W key or the X key. Freeing " +
    "a key makes it available for a character that would otherwise need to be " +
    "reached with the extra-characters key (the right Alt key). List any keys " +
    "you could spare, or leave blank if all are needed.",
  type: "text" as const,
  required: false,
  next: "pb_contact_language",
} satisfies import("../../types.ts").FlowQuestion;

// No validation: advisory free-text.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "W X", note: "spare W and X" },
    { value: "", note: "blank is fine (advisory)" },
    { value: undefined, note: "undefined is fine (advisory)" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

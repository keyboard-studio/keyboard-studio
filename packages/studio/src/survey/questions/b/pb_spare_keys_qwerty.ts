// Per-question module: pb_spare_keys_qwerty (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pb_spare_keys_qwerty",
  prompt:
    "Are there any standard keys on a QWERTY or QWERTZ keyboard that your language does NOT use?",
  help_text:
    "For example, some African languages do not use the letters X or Q, which " +
    "frees those keys for other characters. Think about whether any of the " +
    "standard letter keys on your keyboard are never needed for your language " +
    "and could be replaced with something more useful. List them below, or " +
    "leave blank if all keys are needed.",
  type: "text" as const,
  required: false,
  next: "pb_contact_language",
} satisfies import("../../types.ts").FlowQuestion;

// No validation: advisory free-text; A7 computed by engine from base-keyboard diff.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "X Q", note: "spare X and Q keys in African language" },
    { value: "", note: "blank is fine (advisory)" },
    { value: undefined, note: "undefined is fine (advisory)" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

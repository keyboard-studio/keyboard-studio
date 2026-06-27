// Per-question module: pb_other_free_entry (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pb_other_free_entry",
  prompt:
    "Please list the characters your language needs, or describe your writing system.",
  help_text:
    "Type as many characters as you can, or describe your writing system in " +
    "plain words. The visual character picker (the grid icon next to this " +
    "field) is also available and is seeded with characters common in your " +
    "script. All of this feeds the same confirmed character list. There are no " +
    "wrong answers here -- add as much detail as you can and the studio will " +
    "offer its best suggestion.",
  type: "text" as const,
  required: false,
  // enter the shared universal tail (special letters, punctuation, digits, count)
  next: "pb_special_letters",
} satisfies import("../../types.ts").FlowQuestion;

// No validation: required: false; free-text fallback.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "My script uses these characters: ...", note: "free description" },
    { value: "", note: "blank is fine (not required)" },
    { value: undefined, note: "undefined is fine (not required)" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

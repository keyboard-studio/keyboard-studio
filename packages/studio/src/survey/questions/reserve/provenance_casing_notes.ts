// Per-question module: provenance_casing_notes (Phase A — provenance)
// Ported verbatim from content/flows/phase_a_identity.yaml.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "provenance_casing_notes",
  prompt: "Are there any special rules about capital and lowercase letters?",
  help_text:
    "Most languages follow the same upper/lower pattern as English. Mention " +
    "here if your language has unusual capitalization rules, or if certain " +
    "characters should never be uppercased.",
  type: "text" as const,
  required: false,
  next: "provenance_additional_notes",
} satisfies import("../../types.ts").FlowQuestion;

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "The letter ŋ never appears in uppercase", note: "character casing rule" },
    { value: "Standard English capitalization rules apply", note: "standard rules" },
    { value: undefined, note: "optional — blank is allowed" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

// Per-question module: provenance_existing_tools (Phase A — provenance)
// Ported verbatim from content/flows/phase_a_identity.yaml.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "provenance_existing_tools",
  prompt: "Are there existing tools that speakers already use to type this language?",
  help_text:
    "For example: a font-based keyboard from the 1990s, a custom input method " +
    "someone made locally, or a phone keyboard that only partly covers the " +
    "characters. If there are none, leave this blank.",
  type: "text" as const,
  required: false,
  next: "provenance_orthography_url",
} satisfies import("../../types.ts").FlowQuestion;

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "A font-based keyboard from 1998", note: "legacy tool description" },
    { value: "None known", note: "explicit none" },
    { value: undefined, note: "optional — blank is allowed" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

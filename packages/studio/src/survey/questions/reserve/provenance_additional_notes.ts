// Per-question module: provenance_additional_notes (Phase A — provenance)
// Ported verbatim from content/flows/phase_a_identity.yaml.
// Terminal provenance question — next: null.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "provenance_additional_notes",
  prompt: "Is there anything else the keyboard reviewer should know?",
  help_text:
    "Any other context, concerns, or requirements that did not fit the " +
    "previous questions.",
  type: "text" as const,
  required: false,
  next: null,
} satisfies import("../../types.ts").FlowQuestion;

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "The community uses a custom font — please see the attached README.", note: "additional context" },
    { value: "No additional notes.", note: "explicit nothing" },
    { value: undefined, note: "optional — blank is allowed" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

// Per-question module: provenance_regions (Phase A — provenance)
// Ported verbatim from content/flows/phase_a_identity.yaml.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "provenance_regions",
  prompt: "Where is the language mainly spoken?",
  help_text:
    "Describe the geographic area -- a country, a region, a district, or " +
    "several places. For example: Northwest Region of Cameroon, Mezam Division.",
  type: "text" as const,
  required: false,
  next: "provenance_language_status",
} satisfies import("../../types.ts").FlowQuestion;

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "Northwest Region of Cameroon, Mezam Division", note: "specific region" },
    { value: "Northern Nigeria", note: "country region" },
    { value: undefined, note: "optional — blank is allowed" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

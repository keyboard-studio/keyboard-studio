// Per-question module: provenance_speaker_count (Phase A — provenance)
// Ported verbatim from content/flows/phase_a_identity.yaml.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "provenance_speaker_count",
  prompt: "Approximately how many people speak this language?",
  help_text:
    "A rough number is fine, for example: \"about 65,000\" or \"fewer than 500.\" " +
    "This helps reviewers understand the scale of the community.",
  type: "text" as const,
  required: false,
  next: "provenance_regions",
} satisfies import("../../types.ts").FlowQuestion;

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "about 65,000", note: "approximate phrasing" },
    { value: "fewer than 500", note: "small language community" },
    { value: undefined, note: "optional — blank is allowed" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

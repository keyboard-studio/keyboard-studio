// Per-question module: pa_primary_target (Phase A)
// Ported verbatim from content/flows/phase_a_identity.yaml.
// Mobile-primary notification (spec §8 step 5, Decision 6).

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pa_primary_target",
  prompt: "Is this keyboard primarily for mobile (touchscreen) or desktop (physical keyboard) use?",
  help_text:
    "Keyboard Studio v1 is anchored to physical-keyboard mental models. You " +
    "can complete the full authoring flow and a touch layout will be produced, " +
    "but the survey questions are designed for desktop-first thinking. (See " +
    "spec Decision 6)",
  type: "radio" as const,
  required: false,
  options: [
    { value: "desktop", label: "Desktop (physical keyboard)" },
    {
      value: "mobile",
      label: "Mobile (touchscreen)",
      note:
        "Keyboard Studio v1 is anchored to physical-keyboard mental models. " +
        "You can complete the full authoring flow and a touch layout will be " +
        "produced, but the survey questions are designed for desktop-first " +
        "thinking. (See spec Decision 6)",
    },
    { value: "both", label: "Both desktop and mobile" },
  ],
  next: "author_display_name",
} satisfies import("../../types.ts").FlowQuestion;

// No validate() — optional radio.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "desktop", note: "desktop-first" },
    { value: "mobile", note: "mobile-first (advisory shown)" },
    { value: "both", note: "both platforms" },
    { value: undefined, note: "optional — blank is allowed" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

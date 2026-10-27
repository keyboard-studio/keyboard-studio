// Per-question module: region (Phase A)
// Ported verbatim from content/flows/phase_a_identity.yaml.

import type { QuestionModule } from "../../types.ts";
import { makeRequiredTextValidator } from "../validators.ts";

export const definition = {
  id: "region",
  prompt: "Which country or region is this keyboard mainly for?",
  help_text:
    "Name the primary country or region where speakers of your language live, " +
    "for example: Cameroon, Tanzania, Northwest India. You can list more " +
    "than one if needed.",
  type: "text" as const,
  required: true,
  next: "primary_script",
} satisfies import("../../types.ts").FlowQuestion;

export const validate = makeRequiredTextValidator("Region or country is required.");

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "Cameroon", note: "single country" },
    { value: "Northwest India", note: "region within a country" },
    { value: "Tanzania, Kenya", note: "multiple countries" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: "   ", expectedCode: "required", note: "whitespace-only" },
    { value: undefined, expectedCode: "required" },
  ],
};


const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [], provides: ["reserve-language-region"], requires: ["reserve-language-name"] };
export default mod;

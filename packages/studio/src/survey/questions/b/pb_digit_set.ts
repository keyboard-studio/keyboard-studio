// Per-question module: pb_digit_set (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.

import type { QuestionModule } from "../../types.ts";
import { makeRequiredOptionValidator } from "../validators.ts";

export const definition = {
  id: "pb_digit_set",
  prompt: "Which digits does your language use?",
  help_text:
    "Most languages around the world use the same Western digits 0 through 9. " +
    "Some languages have their own traditional digit shapes (for example, " +
    "Arabic-Indic digits used in Arabic and Persian, Devanagari digits used " +
    "in Hindi). Choose whichever your community uses most, or both if both " +
    "are needed.",
  type: "radio" as const,
  required: true,
  options: [
    {
      value: "western",
      label: "Western digits 0 through 9 (the standard numeric row)",
    },
    {
      value: "native",
      label: "Digits in our own script (not the standard 0-9)",
    },
    {
      value: "both",
      label: "Both Western digits and our own script digits",
    },
  ],
  next: "pb_char_count",
} satisfies import("../../types.ts").FlowQuestion;


export const validate = makeRequiredOptionValidator(definition.options.map((o) => o.value), "Please choose which digits your language uses.", (v) => `"${v}" is not a valid choice.`);

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "western", note: "0-9 only" },
    { value: "native", note: "script-native digits" },
    { value: "both", note: "both digit sets" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
    { value: "arabic-indic", expectedCode: "invalid_option" },
  ],
};


const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [], provides: ["digit-set"] };
export default mod;

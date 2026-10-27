// Per-question module: writing_direction (Phase A)
// Ported verbatim from content/flows/phase_a_identity.yaml.
// Shown for right-to-left scripts (Arabic, Hebrew, Syriac, Thaana, N'Ko, Adlam,
// Mandaic, Samaritan, Hanifi Rohingya); Latin auto-sets LTR without asking.

import type { QuestionModule } from "../../types.ts";
import { makeRequiredFirstOptionValidator } from "../validators.ts";

import { irPath } from "@keyboard-studio/contracts";


export const definition = {
  id: "writing_direction",
  prompt: "Does your text run right-to-left or left-to-right?",
  help_text:
    "Right-to-left scripts such as Arabic, Hebrew, Syriac, Thaana, N'Ko, and " +
    "Adlam are usually written right-to-left, but some communities use a " +
    "left-to-right style for certain contexts. Choose the direction your " +
    "community uses most.",
  type: "radio" as const,
  required: true,
  options: [
    { value: "rtl", label: "Right to left (the usual direction for Arabic and Hebrew)" },
    { value: "ltr", label: "Left to right" },
  ],
  next: "layout_family",
} satisfies import("../../types.ts").FlowQuestion;

export const validate = makeRequiredFirstOptionValidator(definition.options.map((o) => o.value), "Please select a writing direction.", (v) => `"${v}" is not a valid direction.`);

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "rtl", note: "right-to-left" },
    { value: "ltr", note: "left-to-right" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
    { value: "btt", expectedCode: "invalid_option", note: "not a valid direction" },
  ],
};


const mod: QuestionModule = {
  definition,
  validate,
  fixtures,
  inputs: [irPath("header", "bcp47")],
  writes: [],
  provides: ["reserve-writing-direction"],
  requires: ["reserve-primary-script"],
};
export default mod;

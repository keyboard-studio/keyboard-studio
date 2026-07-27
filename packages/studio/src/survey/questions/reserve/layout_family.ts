// Per-question module: layout_family (Phase A)
// Ported verbatim from content/flows/phase_a_identity.yaml.
//
// Engine: pre-populate from BCP47 script subtag + IR structural shape before
// rendering; present as confirmation, not blank selection.

import type { QuestionModule } from "../../types.ts";

import { irPath } from "@keyboard-studio/contracts";

export const definition = {
  id: "layout_family",
  prompt: "Which physical keyboard layout does your community use?",
  help_text:
    "This tells the studio which keyboard patterns to offer you in the next " +
    "step. Most of the world uses QWERTY; choose QWERTZ or AZERTY only if " +
    "your community actually uses one of those regional variants. For " +
    "non-Roman scripts such as Devanagari or Arabic, choose the last option. " +
    "If you are not sure, leave this blank and the studio will show QWERTY " +
    "patterns.",
  type: "radio" as const,
  required: false,
  options: [
    { value: "qwerty", label: "QWERTY (used in most English-speaking countries, and many others)" },
    { value: "qwertz", label: "QWERTZ (used in Germany, Austria, Switzerland, and neighboring countries)" },
    { value: "azerty", label: "AZERTY (used in France, Belgium, and parts of Africa)" },
    { value: "non-roman", label: "A layout designed for a non-Roman script (e.g. Devanagari, Arabic, Thai)" },
  ],
  next: [
    { condition: "value == 'non-roman'", goto: "script_family" },
    { default: true as const, goto: "pa_primary_target" },
  ],
} satisfies import("../../types.ts").FlowQuestion;

// No validate() — optional radio; blank is explicitly allowed ("If you are not sure, leave this blank").

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "qwerty", note: "most common layout" },
    { value: "qwertz", note: "German/Austrian variant" },
    { value: "azerty", note: "French/Belgian variant" },
    { value: "non-roman", note: "triggers script_family follow-up" },
    { value: undefined, note: "optional — blank is allowed" },
  ],
  invalid: [],
};


const mod: QuestionModule = {
  definition,
  fixtures,
  inputs: [irPath("header", "bcp47")],
  writes: [],
};
export default mod;

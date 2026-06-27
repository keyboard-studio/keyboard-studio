// Per-question module: iso_code (Phase A)
// Ported verbatim from content/flows/phase_a_identity.yaml.
//
// required: false — user may leave blank if unsure.
// No validate(): the YAML implies no client-side gating on an autocomplete
// with options_source. The autocomplete widget enforces selection from a list;
// free-text shape-validation would be redundant and is not implied by the YAML.

import type { QuestionModule } from "../../types.ts";

import { irPath } from "@keyboard-studio/contracts";

export const definition = {
  id: "iso_code",
  prompt: "Does your language have a three-letter language code?",
  help_text:
    "Language codes are short tags used by linguists to identify languages " +
    "uniquely, for example: bfd for Bafut, swa for Swahili. " +
    "Search the list to find yours. Leave blank if you are unsure.",
  type: "autocomplete" as const,
  options_source: "@langtags_iso639",
  required: false,
  next: "region",
} satisfies import("../../types.ts").FlowQuestion;

// No validate() — optional autocomplete; the widget enforces valid selection.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "bfd", note: "ISO 639-3 code for Bafut" },
    { value: "swa", note: "ISO 639-3 code for Swahili" },
    { value: undefined, note: "blank is explicitly allowed (required: false)" },
    { value: "", note: "empty string is acceptable for optional question" },
  ],
  invalid: [],
};


const mod: QuestionModule = {
  definition,
  fixtures,
  inputs: [],
  writes: [irPath("header", "bcp47")],
};
export default mod;

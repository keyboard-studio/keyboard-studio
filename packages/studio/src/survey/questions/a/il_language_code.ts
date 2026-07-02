// Per-question module: il_language_code (identity-lite)
// Ported verbatim from content/flows/identity_lite.yaml.
//
// optional (required: false) — the author may leave blank. The language subtag
// drives the bcp47 field in IdentityLiteResult.bcp47 (built by buildTargetBcp47
// in IdentityLite.tsx). An empty subtag degrades suggestBases() to script-match
// ranking (spec §8).
//
// Type is "autocomplete" with options_source "@langtags_iso639" so QuestionField
// renders the langtags-backed searchable picker. Free-text entry is preserved via
// the Autocomplete primitive (datalist approach allows arbitrary typed values).

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "il_language_code",
  prompt: "What language is this keyboard for?",
  help_text:
    "Search by language name, autonym, or ISO 639 code. Examples: \"Hausa\", " +
    "\"ha\", \"Hindi\", \"hi\". If your language is not in the list, type its " +
    "ISO 639 code directly (e.g. \"bft\" for Balti) and continue — free text " +
    "is always accepted. Leave blank if you are unsure.",
  type: "autocomplete" as const,
  options_source: "@langtags_iso639" as const,
  required: false,
  next: "il_target_script",
} satisfies import("../../types.ts").FlowQuestion;

// No validate() — optional free-text; no client-side gating implied by the YAML.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "ha", note: "ISO 639-1 code for Hausa (known in langtags)" },
    { value: "hau", note: "ISO 639-3 code for Hausa — resolves same record" },
    { value: "bft", note: "ISO 639-3 code for Balti — free-text fallback" },
    { value: "xyz-unknown", note: "free-text entry not in langtags — allowed" },
    { value: undefined, note: "blank is explicitly allowed (required: false)" },
    { value: "", note: "empty string is acceptable for optional question" },
  ],
  invalid: [],
};

const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

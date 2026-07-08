// Per-question module: il_language_code (identity-lite)
//
// FIRST question of the identity-lite flow (spec 030): the langtags-backed
// picker is the primary language selector. The author starts typing their
// language's ENGLISH name and picks it from the list; selecting resolves one
// unambiguous langtags entry whose CODE becomes this answer (the datalist value
// is the code — see QuestionField's LangtagsAutocompleteField). That resolved
// entry seeds the downstream English-name (il_language_english) and autonym
// (il_language_autonym) confirmations in IdentityLite.tsx.
//
// optional (required: false) — the author may leave blank or type a free-text
// ISO code for a language absent from langtags (graceful degradation, spec 030
// FR-003). The language subtag drives IdentityLiteResult.bcp47 (buildTargetBcp47
// in IdentityLite.tsx); an empty subtag degrades suggestBases() to script-match
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
    "Start typing your language's English name and pick it from the list — you " +
    "can also search by autonym or ISO 639 code (e.g. \"Hausa\", \"Hindi\", " +
    "\"ha\", \"hi\"). If your language is not listed, type its ISO 639 code " +
    "directly (e.g. \"bft\" for Balti) and continue — free text is always " +
    "accepted. Leave blank if you are unsure.",
  type: "autocomplete" as const,
  options_source: "@langtags_iso639" as const,
  required: false,
  next: "il_language_english",
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

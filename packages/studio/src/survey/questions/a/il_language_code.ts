// Per-question module: il_language_code (identity-lite)
//
// THIRD question (spec 030 US4, FR-009): a CONFIRMATION of the language code,
// pre-filled from the entry resolved by the English-name pick (il_language_english).
// IdentityLite.getSeedValue seeds it with the resolved entry's 3-letter ISO 639-3
// code (e.g. "hau", "hin"), falling back to the canonical bare subtag when the
// entry carries no 639-3 code. The author confirms it or overrides it.
//
// optional (required: false) — when the language was entered as free text with
// no langtags match, this arrives empty and the author may type a code directly
// or leave it blank (graceful degradation, spec 030 FR-003/US4-3). The code
// drives IdentityLiteResult.bcp47 (buildTargetBcp47 in IdentityLite.tsx); an
// empty subtag degrades suggestBases() to script-match ranking (spec §8).
//
// Type is "autocomplete" with options_source "@langtags_iso639" so the author
// can search the code list when overriding; the native datalist always accepts
// free text, so a typed/blank value is preserved.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "il_language_code",
  prompt: "Confirm your language's code",
  help_text:
    "This is the standard code for the language you picked — it goes on the " +
    "finished keyboard. It is filled in from your choice above; change it only " +
    "if you need a different code, or type one directly if your language was " +
    "not in the list.",
  type: "autocomplete" as const,
  options_source: "@langtags_iso639" as const,
  required: false,
  next: "il_target_script",
} satisfies import("../../types.ts").FlowQuestion;

// No validate() — optional free-text confirmation; no client-side gating.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "hau", note: "ISO 639-3 code seeded for Hausa (confirmation)" },
    { value: "hin", note: "ISO 639-3 code seeded for Hindi" },
    { value: "ha", note: "author override to the 2-letter subtag — accepted" },
    { value: "bft", note: "free-text code for a language absent from langtags" },
    { value: undefined, note: "blank is explicitly allowed (required: false)" },
    { value: "", note: "empty string is acceptable for an optional question" },
  ],
  invalid: [],
};

const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

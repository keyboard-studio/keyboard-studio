// Per-question module: il_language_code (identity-lite)
//
// THIRD question (spec 030 US4, FR-009): a CONFIRMATION of the language code,
// pre-filled from the entry resolved by the English-name pick (il_language_english).
// For a RESOLVED language, IdentityLite.getSeedValue seeds it with the entry's
// 3-letter ISO 639-3 code (e.g. "hau", "hin"), falling back to the canonical bare
// subtag when the entry carries no 639-3 code, and QuestionField renders it
// READ-ONLY for confirmation (ReadOnlyCodeField) — to change it the author goes
// Back and re-picks the language (spec 030, Session 2026-07-11 clarification).
//
// optional (required: false) — when the language was entered as free text with
// no langtags match, this arrives empty and the author may type a code directly
// or leave it blank (graceful degradation, spec 030 FR-003/US4-3). The code
// drives IdentityLiteResult.bcp47 (buildTargetBcp47 in IdentityLite.tsx); an
// empty subtag degrades suggestBases() to script-match ranking (spec §8).
//
// Type is "autocomplete" with options_source "@langtags_iso639". For a resolved
// language the survey injects the single 3-letter code and the field is read-only
// (above). For an UNMATCHED free-text language no option is injected, so the field
// falls back to the searchable langtags code picker and a typed/blank value is
// preserved.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "il_language_code",
  prompt: "Confirm your language's code",
  help_text:
    "This is the 3-letter ISO 639-3 code for the language you picked — it goes " +
    "on the finished keyboard. It is resolved from your choice above; to use a " +
    "different code, go back and change the language. If your language was not " +
    "in the list, type its code here.",
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
    { value: "ha", note: "2-letter subtag via the unmatched free-text fallback — accepted (a resolved language's code is read-only)" },
    { value: "bft", note: "free-text code for a language absent from langtags" },
    { value: undefined, note: "blank is explicitly allowed (required: false)" },
    { value: "", note: "empty string is acceptable for an optional question" },
  ],
  invalid: [],
};

const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

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
import type { ExtractContext } from "../../../decisions/extractContext.ts";

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

// Decision spike (km/decisions-spike): base-keyboard probe. Reads the BCP 47
// language subtag from the catalog entry — the same fact this question
// confirms in ask mode. The codec leaves the IR header's bcp47 empty on real
// catalog imports, so the catalog is the primary source; the IR header is a
// fallback for non-catalog imports. Either source may carry a full tag
// (`ha-NG`, `pa-Arab`); only the language subtag is this question's answer —
// buildTargetBcp47 composes script and region back on in BCP 47 order.
// Returns undefined when neither carries language metadata.
export function extractLanguageCode(ctx: ExtractContext): string | undefined {
  const tag = ctx.catalog?.languages?.[0] ?? ctx.ir?.header.bcp47[0];
  const subtag = tag?.split("-")[0]?.toLowerCase();
  return subtag ? subtag : undefined;
}

// Output reach (spec 059 FR-016): `writes` stays `[]` — this question writes no
// KeyboardIR — while `outputs` states that the answer nevertheless reaches an
// emitted artifact. Here, the answer contributes the language subtag to the
// composed tag the descriptor declares.
const mod: QuestionModule = {
  definition,
  fixtures,
  inputs: [],
  writes: [],
  outputs: [{ target: "package-descriptor", field: "bcp47" }],
  specRef: "specs/030-langtags-identity-autocomplete",
  // Decision spike (km/decisions-spike).
  provides: ["language-code"],
  requires: ["language-name"],
  extract: extractLanguageCode,
  // Spec 092 (T033): the resolved langtags entry's code as a lookup
  // default (the entry resolution — ISO 639-3 preferred — happens where
  // the entry is resolved; this declaration names the value + source).
  lookupDefault: (ctx) => {
    const code = ctx.identity?.languageCode;
    return code !== undefined && code !== "" ? { value: code, source: "langtags" } : undefined;
  },
  // Design correction (owner ruling, 2026-10-08 — recorded in
  // specs/092-live-extraction/followups.md): the live extraction pass
  // must never seed or offer this decision. The author selects a target
  // language (this step's Q1–Q3); that choice is the code's ONLY live
  // source — IdentityLite evaluates the lookupDefault above from the
  // author's own resolution during the identity step and records it as
  // a visible, overridable `default`. Choosing a base afterwards
  // contributes metadata for available keys (the produced set, hence
  // the convenience step's surplus candidates); it never writes the
  // identity's language value. The base's code in an unanswered slot is
  // a wrong fact about the author's language, and downstream
  // derivations consume the slot as author-declared: the composed
  // bcp47, Phase B's exemplar auto-seed, and the carve needed set's
  // CLDR slice (the T028 convenience-gate failure). The `extract` probe
  // above stays for the decision-flow probe (runDecisionFlow /
  // DecisionsDemo), which has no prior target-language selection to
  // override; `seedWhen` is read only by the live pass.
  seedWhen: () => false,
};
export default mod;

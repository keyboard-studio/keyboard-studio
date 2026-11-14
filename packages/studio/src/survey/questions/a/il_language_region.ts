// Per-question module: il_language_region (identity-lite)
//
// CONDITIONAL question (spec 030 US3, spec 115 US3): shown when the language picked
// at il_language_english is region-ambiguous (its resolved langtags entry has more
// than one regionVariant) or the author asked for a region in the chooser's
// Customize panel (ctx.ilRegionRequested), for any language. SurveyRunner reaches it via IdentityLite's
// getNextOverride (il_language_english -> il_language_region); when the language
// is unambiguous the static next (il_language_english -> il_language_autonym) is
// used and this question never appears.
//
// The datalist options are supplied dynamically by IdentityLite.getSeedOptions
// (the resolved entry's regionVariants as {value: region-code, label: region
// name}). Picking a region narrows the resolved variant, which then drives the
// autonym / local-name / script seeds and the BCP47 region subtag. Advances to
// il_language_autonym.
//
// optional (required: false) — the author may skip; the flow then falls back to
// the primary/default variant rather than blocking (spec 030 FR-014).

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "il_language_region",
  prompt: "Which region is your language from?",
  // CONTENT REVIEW (Article VI): this help text and the option labels supplied by
  // IdentityLite.getSeedOptions (the default-region mark, "Other region...") are
  // survey text owned by the content team.
  help_text:
    "A tag names a region only when it is not the language's usual one. The list " +
    "starts with this language's default region; pick another place your community " +
    "is in, or choose \"Other region…\" and type any two-letter country code. Skip " +
    "if you are unsure.",
  type: "autocomplete" as const,
  required: false,
  next: "il_language_autonym",
} satisfies import("../../types.ts").FlowQuestion;

// No validate() — optional; any region code (or free text / blank) is accepted.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "DJ", note: "region code for a regionVariant (e.g. Afar in Djibouti)" },
    { value: "ET", note: "the primary region" },
    { value: undefined, note: "blank is allowed (required: false) — falls back to the primary variant" },
    { value: "", note: "empty string is acceptable for an optional question" },
  ],
  invalid: [],
};

// Output reach (spec 059 FR-016): `writes` stays `[]` — this question writes no
// KeyboardIR — while `outputs` states that the answer nevertheless reaches an
// emitted artifact. Here, the answer contributes the region subtag to the
// composed tag the descriptor declares.
const mod: QuestionModule = {
  definition,
  fixtures,
  inputs: [],
  writes: [],
  outputs: [{ target: "package-descriptor", field: "bcp47" }],
  specRef: "specs/030-langtags-identity-autocomplete",
  // Decision spike (km/decisions-spike).
  provides: ["language-region"],
  requires: ["language-name"],
};
export default mod;

// Per-question module: il_language_region (identity-lite)
//
// CONDITIONAL question (spec 030 US3): shown only when the language picked in
// il_language_code is region-ambiguous — i.e. its resolved langtags entry has
// more than one regionVariant. SurveyRunner reaches it via IdentityLite's
// getNextOverride (il_language_code -> il_language_region); when the language is
// unambiguous the static next (il_language_code -> il_language_english) is used
// and this question never appears.
//
// The datalist options are supplied dynamically by IdentityLite.getSeedOptions
// (the resolved entry's regionVariants as {value: region-code, label: region
// name}). Picking a region narrows the resolved variant, which then drives the
// autonym / local-name / script seeds and the BCP47 region subtag.
//
// optional (required: false) — the author may skip; the flow then falls back to
// the primary/default variant rather than blocking (spec 030 FR-014).

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "il_language_region",
  prompt: "Which region is your language from?",
  help_text:
    "This language is used in more than one place, and the local name or spelling " +
    "can differ by region. Pick the region that matches your community — or skip " +
    "if you are unsure.",
  type: "autocomplete" as const,
  required: false,
  next: "il_language_english",
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

const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

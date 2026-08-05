// Per-question module: pf_scope_variety (Phase F)
//
// NEW (Phase F documentation revision). The BCP47 tag names a language; it never
// states which VARIETY, which region, or what the keyboard deliberately does not
// cover. In the shipped corpus this scoping is what separates a usable help page
// from an ambiguous one, and a 1-3 sentence welcome paragraph tends to squeeze
// it out.
//
// Corpus examples:
//   release/sil/sil_hebrew — "designed for Biblical Hebrew" (not Modern).
//   release/fv/fv_sencoten — "the BC Coast region of Canada."
//   release/k/korean_rr — "for those unfamiliar with the standard Korean layout."
//   release/sil/sil_euro_latin — "should not be expected to be enhanced for
//     languages outside of Europe" (an explicit non-goal).

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pf_scope_variety",
  prompt:
    "Which variety, region, or users is this keyboard for — and what is it NOT for? (optional)",
  help_text:
    "Be specific about scope. If your language has several varieties, dialects, " +
    "or orthographies, say which one this keyboard follows. Name the region or " +
    "country if that matters. If there is something users might reasonably " +
    "expect but the keyboard does not do, say so plainly — that saves people " +
    "time. For example: \"For Biblical Hebrew, not Modern Israeli Hebrew.\" Or: " +
    "\"For the SENCOTEN language of the BC Coast region of Canada.\" Or: \"This " +
    "keyboard covers European languages and is not intended to be extended " +
    "beyond them.\"",
  type: "text" as const,
  required: false,
  next: "pf_provenance_basis",
} satisfies import("../../types.ts").FlowQuestion;

// No validation: required: false; free-text scope statement.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    {
      value: "For Biblical Hebrew, not Modern Israeli Hebrew.",
      note: "variety distinction (sil_hebrew pattern)",
    },
    {
      value:
        "For the Bafut (Fa') language of the Northwest Region of Cameroon. It does not cover the neighbouring Bamileke varieties.",
      note: "region plus an explicit non-goal",
    },
    { value: "", note: "blank is fine (optional)" },
    { value: undefined, note: "undefined is fine (optional)" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

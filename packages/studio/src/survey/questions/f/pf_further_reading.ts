// Per-question module: pf_further_reading (Phase F)
//
// NEW (Phase F documentation revision). 32 help pages link out to further
// reading. Formulaic links (Wikipedia, Omniglot) are templatable from the
// language name; CURATED ones are not. release/k/khmer_angkor links the Unicode
// U1780 chart, Ethnologue Cambodia, and Unicode chapter 16;
// release/m/mozhi_malayalam points at the "Mozhi 2.0 Spec"; and
// release/h/hieroglyphic recommends a competing tool outright: "If proper
// formatting is an important issue, try using JSesh instead of this keyboard."

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pf_further_reading",
  prompt: "Any documents, sites, or other tools users should know about? (optional)",
  help_text:
    "Link the resources that genuinely help someone using this keyboard: an " +
    "orthography guide or spelling standard, a typing-practice document, a " +
    "character chart, or a language reference. If a different tool is a better " +
    "fit for some task, say so — pointing users to the right tool builds trust. " +
    "One per line, with a short note about what each is. Skip generic " +
    "encyclopedia links; those can be added automatically.",
  type: "text" as const,
  required: false,
  next: "pf_project_url",
} satisfies import("../../types.ts").FlowQuestion;

// No validation: required: false; free-text resource lines.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    {
      value:
        "https://example.org/orthography.pdf - the agreed spelling guide\nhttps://example.org/practice.docx - typing practice exercises",
      note: "curated orthography and practice resources",
    },
    {
      value:
        "For long formatted documents, a dedicated layout editor may suit you better than this keyboard.",
      note: "honest alternative-tool pointer (hieroglyphic pattern)",
    },
    { value: "", note: "blank is fine (optional)" },
    { value: undefined, note: "undefined is fine (optional)" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

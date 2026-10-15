// Per-question module: pf_font_guidance (Phase F)
//
// NEW (Phase F documentation revision). Fonts are the single most-documented
// topic in the shipped corpus after the layout chart itself: 297 of 934 help
// pages (31.8%) and 316 of 868 welcome pages discuss fonts, and 38 link to a
// download. The welcome element spec (§2) puts a font note in the page
// introduction, so this question sits in the core docs flow, right after the
// welcome paragraph — it is not part of the opt-in battery, and its answer
// renders in the intro (the renderer's fontNote slot), never under
// "Additional Detail". Nothing lists the package's fonts in the documentation
// automatically — no renderer reads OSKFont / DisplayFont / bundled fonts —
// so the note is entirely the author's to write: which fonts a user must
// obtain, and which characters need a specialty font.
//
// Corpus examples:
//   release/sil/sil_euro_latin — "Most of the characters are included in the
//     fonts Calibri, Cambria, Arial, and Times New Roman... Some of the
//     characters in this keyboard are only supported by specialty fonts, like
//     Code2000."
//   release/sil/sil_ethiopic — "the Abyssinica SIL font (version 1.5+) is
//     recommended" for newer Unicode 6.0+ codepoints.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pf_font_guidance",
  prompt: "Which fonts display this keyboard's characters correctly? (optional)",
  help_text:
    "Name the fonts you know render your alphabet properly, and say where users " +
    "can get them if they are not already installed. If some characters only " +
    "appear in a specialty font, say which characters and which font. What you " +
    "write here appears in the introduction of the welcome and help pages, " +
    "with the description. For example: \"Most characters work in " +
    "Calibri, Arial, and Times New Roman. The tone marks only render correctly " +
    "in Charis SIL, available free from software.sil.org/charis.\" Leave blank " +
    "if common system fonts are sufficient.",
  type: "text" as const,
  required: false,
  // Routing: core flow — pf_welcome_paragraph points here, and this converges
  // on pf_usage_tip_1. The opt-in battery no longer routes through this
  // question (pf_doc_language_second now goes straight to pf_usage_tip_2).
  next: "pf_usage_tip_1",
} satisfies import("../../types.ts").FlowQuestion;

// No validation: required: false; free-text font guidance.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    {
      value:
        "Most characters work in Calibri, Arial, and Times New Roman. The tone marks only render correctly in Charis SIL, available free from software.sil.org/charis.",
      note: "common fonts plus a specialty font with a source",
    },
    {
      value: "Abyssinica SIL version 1.5 or newer is recommended.",
      note: "single recommended font with a version floor (sil_ethiopic pattern)",
    },
    { value: "", note: "blank is fine — common system fonts suffice" },
    { value: undefined, note: "undefined is fine (optional)" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [], provides: ["help-font-guidance"] };
export default mod;

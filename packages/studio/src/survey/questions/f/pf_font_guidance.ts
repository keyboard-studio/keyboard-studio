// Per-question module: pf_font_guidance (Phase F)
//
// NEW (Phase F documentation revision). Fonts are the single most-documented
// topic in the shipped corpus after the layout chart itself: 297 of 934 help
// pages (31.8%) and 316 of 868 welcome pages discuss fonts, and 38 link to a
// download. The package's OWN bundled fonts are derivable from the .kps
// (OSKFont / DisplayFont / bundled .ttf), so this question deliberately asks
// only what the data cannot answer: which fonts a user must obtain, and which
// characters need a specialty font.
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
    "appear in a specialty font, say which characters and which font. Fonts " +
    "bundled inside this keyboard package are listed automatically, so you do " +
    "not need to repeat them here. For example: \"Most characters work in " +
    "Calibri, Arial, and Times New Roman. The tone marks only render correctly " +
    "in Charis SIL, available free from software.sil.org/charis.\" Leave blank " +
    "if common system fonts are sufficient.",
  type: "text" as const,
  required: false,
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


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

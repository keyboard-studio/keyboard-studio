// Per-question module: pf_related_keyboards (Phase F)
//
// NEW (Phase F documentation revision). 384 shipped .kps files declare
// <RelatedPackages>, e.g. release/sil/sil_ipa/source/sil_ipa.kps:
//   <RelatedPackage ID="ipauni11" Relationship="deprecates"/>
// The declared RELATIONSHIP is derivable; the reader-facing "which should I use
// and why" is not. release/gff/gff_amharic maintains a curated cross-family index
// of eleven sibling Ethiopic keyboards.
//
// This question also captures migration guidance, which 18 help pages carry:
//   release/sil/sil_euro_latin — "the keys have changed position compared to 2.x
//     versions of the keyboard."
//   release/sil/sil_ethiopic — "Note on Legacy SIL Ethiopic Keyboard Compatibility"

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pf_related_keyboards",
  prompt:
    "Are there related or older keyboards users should know about? (optional)",
  help_text:
    "If other keyboards cover nearby languages or the same language a different " +
    "way, name them and say briefly when someone would choose each. If this " +
    "keyboard replaces an older one, say what changed — especially if keys have " +
    "moved, because users with muscle memory need the warning. For example: " +
    "\"Replaces the older layout; note that the vowel keys have moved since " +
    "version 2.\" Or: \"For the neighbouring dialect, use the separate keyboard " +
    "for that variety instead.\"",
  type: "text" as const,
  required: false,
  next: "pf_known_limitations",
} satisfies import("../../types.ts").FlowQuestion;

// No validation: required: false; free-text related-keyboard notes.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    {
      value:
        "Replaces the older layout; note that the vowel keys have moved since version 2.",
      note: "migration warning (sil_euro_latin pattern)",
    },
    {
      value:
        "For the neighbouring dialect, use the separate keyboard for that variety instead.",
      note: "sibling-keyboard pointer",
    },
    { value: "", note: "blank is fine (optional)" },
    { value: undefined, note: "undefined is fine (optional)" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

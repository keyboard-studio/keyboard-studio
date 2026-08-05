// Per-question module: pf_provenance_basis (Phase F)
//
// NEW (Phase F documentation revision). Distinct from credits (WHO built it) and
// from purpose (WHAT it is for): this is the standard, authority, or community
// decision the layout RESTS ON. In the shipped corpus it is what gives a keyboard
// its legitimacy, and it is never inferable from the rules.
//
// Corpus examples:
//   release/k/khmer_angkor — "adopted from NiDA keyboard which is widely used at
//     the present."
//   release/t/thamizha_tamil99_ext — "officially approved by the regional
//     government of Tamil Nadu."
//   release/b/burushaski_girminas — "proposed and agreed upon by representatives
//     of all three varieties of Burushaski of Hunza, Yasin and Nagar."
//   release/sil/sil_cherokee_nation — "following the official Cherokee Nation
//     layout."

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pf_provenance_basis",
  prompt:
    "Is this layout based on a standard, an official layout, or a community decision? (optional)",
  help_text:
    "If the key arrangement or orthography comes from somewhere — a national " +
    "standard, a government or language-board approval, an existing widely-used " +
    "keyboard, or an agreement reached by community representatives — say so " +
    "here. This tells users the layout is not arbitrary. For example: \"The key " +
    "arrangement is adopted from the NiDA keyboard, which is already widely " +
    "used.\" Or: \"This orthography was agreed upon by representatives of all " +
    "three language varieties.\" Leave blank if the layout is your own design.",
  type: "text" as const,
  required: false,
  next: "pf_design_rationale",
} satisfies import("../../types.ts").FlowQuestion;

// No validation: required: false; free-text provenance statement.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    {
      value:
        "The key arrangement is adopted from the NiDA keyboard, which is already widely used.",
      note: "existing-layout basis (khmer_angkor pattern)",
    },
    {
      value:
        "An extension of the Tamil 99 standard, officially approved by the regional government of Tamil Nadu.",
      note: "standards-body endorsement (thamizha_tamil99_ext pattern)",
    },
    {
      value:
        "This orthography was proposed and agreed upon by representatives of all three varieties of the language.",
      note: "community mandate (burushaski_girminas pattern)",
    },
    { value: "", note: "blank is fine — original design" },
    { value: undefined, note: "undefined is fine (optional)" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

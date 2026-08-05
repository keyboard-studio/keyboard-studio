// Per-question module: pf_canonical_order (Phase F)
//
// NEW (Phase F documentation revision). Reached only when ctx.routing_group is
// "non-roman" (branched from pf_design_rationale), because canonical ordering is
// a real concern for abjads and abugidas and meaningless for Latin-family
// alphabets.
//
// This is an ORTHOGRAPHIC CONVENTION, not something the rules assert — the
// keyboard can emit marks in any order the author types them. Where it appears
// in the corpus it is rendered as the most prominent line on the help page:
//   release/sil/sil_hebrew — <p class="important">Consonant - Dagesh - Vowel -
//     Low Marks - Pre-positive Marks - High Marks - Post-Positive Marks</p>
//   release/k/khmer_angkor — "Consonant + Subscript(s) + Consonant Shifter +
//     Vowel + Diacritic"

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pf_canonical_order",
  prompt:
    "In what order should marks be typed on a base character? (optional)",
  help_text:
    "When a syllable carries several marks, most writing systems expect them in " +
    "one particular order, even though the keyboard will accept any order. " +
    "Stating that order is often the single most useful line on a help page, " +
    "because it prevents text that looks correct but does not match or search " +
    "properly. Write it as a simple sequence separated by dashes or plus signs. " +
    "For example: \"Consonant - Dagesh - Vowel - Low Marks - High Marks\" or " +
    "\"Consonant + Subscript + Consonant Shifter + Vowel + Diacritic\". Leave " +
    "blank if your writing system has no such convention.",
  type: "short_text" as const,
  required: false,
  next: "pf_script_glossary",
} satisfies import("../../types.ts").FlowQuestion;

// No validation: required: false; free-text ordering statement.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    {
      value:
        "Consonant - Dagesh - Vowel - Low Marks - Pre-positive Marks - High Marks - Post-Positive Marks",
      note: "canonical example from sil_hebrew",
    },
    {
      value: "Consonant + Subscript(s) + Consonant Shifter + Vowel + Diacritic",
      note: "khmer_angkor pattern",
    },
    { value: "", note: "blank is fine — no ordering convention" },
    { value: undefined, note: "undefined is fine (optional)" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

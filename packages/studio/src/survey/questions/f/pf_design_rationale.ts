// Per-question module: pf_design_rationale (Phase F)
//
// NEW (Phase F documentation revision). The rules are derivable; the OBJECTIVES
// behind them never are. release/m/mozhi_malayalam states four explicit goals —
// "Naturalness: being close to transliteration traditions of Malayalees;
// Consistency - same sequence for same phenomena; Economical about keystrokes;
// Type without pressing shift key" — and release/h/hieroglyphic explains it was
// "designed to bridge the gap between the available hieroglyphic editors... and
// the websites and programs designed for basic fonts." Neither is a welcome
// paragraph nor a usage tip.
//
// ROUTING: this is the branch point into the complex-script questions. The
// condition reads ctx.routing_group, which is set from the identity step
// (see editors/adapters/panelAdapters.tsx contextFromIdentity → prefill.routingGroup,
// derived in lib/scriptAxes.ts). Value is "qwerty-qwertz" for Latn/Cyrl/Grek/Geor/Armn
// and "non-roman" for everything else (Arab, Hebr, Deva, ...). Only non-roman
// authors are asked about canonical order and script terminology.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pf_design_rationale",
  prompt: "What were you trying to achieve with this layout? (optional)",
  help_text:
    "Explain the thinking behind the design, especially any trade-offs you made. " +
    "Users who understand the principle can predict how the rest of the keyboard " +
    "behaves instead of memorising each key. Good answers name goals like staying " +
    "close to how people already type the language informally, keeping the same " +
    "sequence for the same kind of sound, reducing the number of keystrokes, or " +
    "avoiding the Shift key. For example: \"Sequences follow existing " +
    "transliteration habits; 'h' always marks an aspirated consonant; common " +
    "letters need no Shift.\"",
  type: "text" as const,
  required: false,
  next: [
    { condition: "ctx.routing_group == 'non-roman'", goto: "pf_canonical_order" },
    { default: true, goto: "pf_example_words" },
  ],
} satisfies import("../../types.ts").FlowQuestion;

// No validation: required: false; free-text rationale.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    {
      value:
        "Sequences follow existing transliteration habits; 'h' always marks an aspirated consonant; common letters need no Shift key.",
      note: "stated goals (mozhi_malayalam pattern)",
    },
    {
      value:
        "Designed so students can type hieroglyphs in ordinary fonts without a specialist editor.",
      note: "gap-bridging rationale (hieroglyphic pattern)",
    },
    { value: "", note: "blank is fine (optional)" },
    { value: undefined, note: "undefined is fine (optional)" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

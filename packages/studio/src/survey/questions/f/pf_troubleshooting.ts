// Per-question module: pf_troubleshooting (Phase F)
//
// NEW (Phase F documentation revision). 173 of 934 help pages (18.5%) carry a
// troubleshooting section. Two tiers exist in the corpus: generic boilerplate
// ("if square boxes are displayed instead of characters, read our troubleshooting
// guide" — repeated verbatim across dozens of SIL keyboards, and templatable), and
// genuinely keyboard-specific symptom/fix pairs that only the author knows.
// release/k/korean_rr documents "The IME window is not visible" and "After I
// started typing, the IME window disappeared" with four diagnostic checks;
// release/w/winchus ships separate mobile and desktop symptom tables.
//
// This question targets the second tier only.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pf_troubleshooting",
  prompt:
    "What problems do users of THIS keyboard run into, and how are they fixed? (optional)",
  help_text:
    "Think of the questions you have actually been asked, or the mistakes you " +
    "expect. Write each as the symptom followed by the fix, one per line. Skip " +
    "the general Keyman problems — missing fonts and installation issues are " +
    "already covered by the standard help. Focus on what is specific to this " +
    "keyboard. For example: \"Marks appear in the wrong place - type the " +
    "consonant first, then the vowel.\" Or: \"Nothing happens when I press the " +
    "right Alt key - check that no other program has claimed that shortcut.\"",
  type: "text" as const,
  required: false,
  next: "pf_related_keyboards",
} satisfies import("../../types.ts").FlowQuestion;

// No validation: required: false; free-text symptom/fix lines.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    {
      value:
        "Marks appear in the wrong place - type the consonant first, then the vowel.",
      note: "ordering symptom with a fix",
    },
    {
      value:
        "The suggestion window is not visible - check that it has not been moved off-screen.\nTyping stops working after a while - switch away from the keyboard and back.",
      note: "two symptom/fix lines (korean_rr pattern)",
    },
    { value: "", note: "blank is fine (optional)" },
    { value: undefined, note: "undefined is fine (optional)" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

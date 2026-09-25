// Per-question module: pf_history_entry_bullets (Phase F, spec 076 US5 / T043)
//
// Edit-branch companion to pf_history_entry: reached only when the author
// chooses "edit" on the HISTORY proposal. Free-text bullet editing, one
// bullet per line; converges back on pf_more_detail_gate.

import type { FlowQuestion, QuestionModule } from "../../types.ts";

export const definition = {
  id: "pf_history_entry_bullets",
  prompt: "Edit the HISTORY entry's bullet points, one per line.",
  help_text:
    "Each line becomes one bullet under the entry's heading. Leave a line as " +
    "we drafted it, reword it, remove it, or add your own — whatever is here " +
    "when you continue is what ships.",
  type: "text" as const,
  required: false,
  next: "pf_more_detail_gate",
} satisfies FlowQuestion;

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "Adapted from basic_kbdfr v1.3 via keyboard-studio.\nAdded 2 characters: é, è", note: "two edited bullets" },
    { value: "", note: "blank is fine — falls back to the drafted bullets (see applyHistoryEntryAction)" },
    { value: undefined, note: "undefined is fine (optional)" },
  ],
  invalid: [],
};

/** Split a `pf_history_entry_bullets` answer into bullets: one per non-blank line. */
export function parseEditedBullets(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

const mod: QuestionModule = {
  definition,
  fixtures,
  inputs: [],
  writes: [],
  specRef: "specs/076-documentation-completeness",
};
export default mod;

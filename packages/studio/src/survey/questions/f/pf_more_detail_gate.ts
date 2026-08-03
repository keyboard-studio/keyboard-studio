// Per-question module: pf_more_detail_gate (Phase F)
//
// NEW (Phase F documentation revision). The triage gate that resolves the
// structural mismatch in the shipped corpus: 54% of help pages are under 1500
// bytes (one paragraph plus an auto-rendered layout placeholder), while
// complex-script keyboards document far more — release/m/mozhi_malayalam has
// roughly 30 named rule sections, release/gff/gff_amharic about 14. A fixed
// question count serves neither end.
//
// Answering "no" routes straight to credits, so a minimal keyboard finishes in
// a few screens. Answering "yes" opens the optional documentation battery.
// Follows the established Phase B gate pattern (see pb_accent_marks_gate).

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "pf_more_detail_gate",
  prompt: "Add optional documentation sections?",
  help_text:
    "No is a perfectly good answer — you already have a working help page, and " +
    "answering No finishes with just credits and contact details. Say Yes only " +
    "if you already know things worth writing down: fonts that render your " +
    "alphabet, the standard the layout follows, example words, known problems, " +
    "or related keyboards. These are for information you already have, not " +
    "research to go and do. You can come back and add them later.",
  type: "bool" as const,
  required: true,
  next: [
    { condition: "value == 'true'", goto: "pf_doc_language" },
    { default: true, goto: "pf_credits" },
  ],
} satisfies import("../../types.ts").FlowQuestion;

export function validate(
  value: string | string[] | undefined,
): ValidationResult {
  const v = typeof value === "string" ? value : "";
  if (v !== "true" && v !== "false") {
    return {
      ok: false,
      code: "required",
      message: "Please answer Yes or No.",
    };
  }
  return { ok: true };
}

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "true", note: "author opts into the optional battery" },
    { value: "false", note: "minimal path — routes straight to pf_credits" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
  ],
};


const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;

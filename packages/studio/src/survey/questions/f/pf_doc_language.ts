// Per-question module: pf_doc_language (Phase F)
//
// NEW (Phase F documentation revision). Asked FIRST because it changes how every
// later Phase F answer should be written. Grounded in the shipped corpus: several
// of the best-documented keyboards are not English-only — release/sil/sil_yi
// writes every paragraph twice (English + Chinese), release/w/winchus is entirely
// Spanish, release/sil/sil_cameroon_azerty ships both azerty-en.php and
// azerty-fr.php, and release/k/khmer_angkor ships EN and KH PDF manuals.
// Nothing in the keyboard data reveals the audience's reading language.
//
// The help's MAIN language. winchus (Spanish) and sil_cameroon_azerty (French)
// are written in a national language that is neither English nor the
// keyboard's own, so "another language" opens a langtags picker
// (pf_doc_language_other). A second language for a bilingual page is
// pf_doc_language_second. The main language becomes the page's `<html lang>`.

import type { QuestionModule, ValidationResult } from "../../types.ts";

// "bilingual" is the pre-pf_doc_language_second answer (English + the
// keyboard's language). It is no longer offered, but a draft saved with it
// must still validate; extractHelpDocs reads it as ["en", target].
const OPTION_VALUES = new Set(["english", "target", "other", "bilingual"]);

export const definition = {
  id: "pf_doc_language",
  prompt: "What language should the help page be written in?",
  help_text:
    "This decides how you write every answer that follows. Choose the language " +
    "your users actually read: English, the keyboard's own language, or another " +
    "language such as the national language of the region. You can add a second " +
    "language on the next screen.",
  type: "radio" as const,
  // Optional (minimum-questions revision): an author who opts into the battery
  // is never blocked by a question they have no view on.
  required: false,
  options: [
    { value: "english", label: "English" },
    {
      value: "target",
      label: "The language of the keyboard ({{language_name}})",
      note: "Best when the users do not read English",
    },
    {
      value: "other",
      label: "Another language…",
      note: "For example the national language of the region",
    },
  ],
  next: [
    { condition: "value == 'other'", goto: "pf_doc_language_other" },
    { default: true, goto: "pf_doc_language_second" },
  ],
} satisfies import("../../types.ts").FlowQuestion;

export function validate(
  value: string | string[] | undefined,
): ValidationResult {
  const v = typeof value === "string" ? value : "";
  // Blank is allowed — the question is optional. The check below still guards
  // against a value outside the offered options.
  if (v.length === 0) {
    return { ok: true };
  }
  if (!OPTION_VALUES.has(v)) {
    return {
      ok: false,
      code: "invalid_option",
      message: "Please choose one of the offered languages.",
    };
  }
  return { ok: true };
}

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "english", note: "English-only help (the common case)" },
    { value: "target", note: "help written in the keyboard's own language" },
    { value: "other", note: "a national language, as winchus (Spanish) ships" },
    { value: "bilingual", note: "legacy answer from a saved draft — still accepted" },
    { value: "", note: "blank is fine (optional)" },
    { value: undefined, note: "undefined is fine (optional)" },
  ],
  invalid: [
    { value: "french", expectedCode: "invalid_option", note: "a language goes through 'other', not a bare name" },
  ],
};


const mod: QuestionModule = {
  definition,
  validate,
  fixtures,
  inputs: [],
  writes: [],
  provides: ["help-doc-language"], requires: ["help-more-detail"],
  specRef: "specs/061-help-docs-generation",
};
export default mod;

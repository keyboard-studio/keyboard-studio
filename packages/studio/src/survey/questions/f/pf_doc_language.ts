// Per-question module: pf_doc_language (Phase F)
//
// NEW (Phase F documentation revision). Asked FIRST because it changes how every
// later Phase F answer should be written. Grounded in the shipped corpus: several
// of the best-documented keyboards are not English-only — release/sil/sil_yi
// writes every paragraph twice (English + Chinese), release/w/winchus is entirely
// Spanish, release/sil/sil_cameroon_azerty ships both azerty-en.php and
// azerty-fr.php, and release/k/khmer_angkor ships EN and KH PDF manuals.
// Nothing in the keyboard data reveals the audience's reading language.

import type { QuestionModule, ValidationResult } from "../../types.ts";

const OPTION_VALUES = new Set(["english", "target", "bilingual"]);

export const definition = {
  id: "pf_doc_language",
  prompt: "What language should the help page be written in?",
  help_text:
    "This decides how you write every answer that follows. Choose the language " +
    "your users actually read. Many published keyboards are not English-only: " +
    "some ship help in the language community's own language, and some publish " +
    "both. If you pick \"both\", write each answer in both languages and the " +
    "help page will present them together.",
  type: "radio" as const,
  required: true,
  options: [
    { value: "english", label: "English" },
    {
      value: "target",
      label: "The language of the keyboard ({{language_name}})",
      note: "Best when the users do not read English",
    },
    { value: "bilingual", label: "Both — English and {{language_name}}" },
  ],
  next: "pf_welcome_paragraph",
} satisfies import("../../types.ts").FlowQuestion;

export function validate(
  value: string | string[] | undefined,
): ValidationResult {
  const v = typeof value === "string" ? value : "";
  if (v.length === 0) {
    return {
      ok: false,
      code: "required",
      message: "Please choose a language for the help page.",
    };
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
    { value: "bilingual", note: "both, as sil_yi and sil_cameroon_azerty ship" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
    { value: "french", expectedCode: "invalid_option", note: "not an offered option" },
  ],
};


const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;

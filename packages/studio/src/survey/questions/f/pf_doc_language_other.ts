// Per-question module: pf_doc_language_other (Phase F)
//
// Reached only when pf_doc_language is "other". The langtags picker (the same
// one il_language_code uses) commits a language code, which becomes the help
// page's `<html lang>` — e.g. "es" for release/w/winchus.

import type { QuestionModule } from "../../types.ts";
import { validateDocLanguageTag } from "../docLanguageTag.ts";

export const definition = {
  id: "pf_doc_language_other",
  prompt: "Which language will the help page be written in?",
  help_text:
    "Search by the language's name or code. Often this is the national or " +
    "regional language your users read, such as French, Spanish, or Swahili.",
  type: "autocomplete" as const,
  options_source: "@langtags_iso639" as const,
  required: false,
  next: "pf_doc_language_second",
} satisfies import("../../types.ts").FlowQuestion;

export const validate = validateDocLanguageTag;

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "", note: "blank is fine — the language is left out" },
    { value: "es", note: "Spanish, as release/w/winchus ships" },
    { value: "fr", note: "French, as sil_cameroon_azerty's second page" },
    { value: "zh-Hans", note: "a typed tag with a script subtag" },
  ],
  invalid: [
    { value: "French", expectedCode: "invalid_tag", note: "a name, not a code" },
  ],
};

const mod: QuestionModule = {
  definition,
  validate,
  fixtures,
  inputs: [],
  writes: [],
  provides: ["help-doc-language-other"], requires: ["help-doc-language"],
  specRef: "specs/061-help-docs-generation",
};
export default mod;

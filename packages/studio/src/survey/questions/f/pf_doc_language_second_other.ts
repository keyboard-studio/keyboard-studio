// Per-question module: pf_doc_language_second_other (Phase F)
//
// Reached only when pf_doc_language_second is "other": the langtags picker for
// a bilingual page's second language (e.g. "zh" for release/sil/sil_yi).

import type { QuestionModule } from "../../types.ts";
import { validateDocLanguageTag } from "../docLanguageTag.ts";

export const definition = {
  id: "pf_doc_language_second_other",
  prompt: "Which second language will the help page include?",
  help_text: "Search by the language's name or code.",
  type: "autocomplete" as const,
  options_source: "@langtags_iso639" as const,
  required: false,
  next: "pf_font_guidance",
} satisfies import("../../types.ts").FlowQuestion;

export const validate = validateDocLanguageTag;

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "", note: "blank is fine — the language is left out" },
    { value: "zh", note: "Chinese, as release/sil/sil_yi ships" },
    { value: "fr", note: "French" },
  ],
  invalid: [
    { value: "Chinese", expectedCode: "invalid_tag", note: "a name, not a code" },
  ],
};

const mod: QuestionModule = {
  definition,
  validate,
  fixtures,
  inputs: [],
  writes: [],
  provides: ["help-doc-language-second-other"], requires: ["help-doc-language-second"],
  specRef: "specs/061-help-docs-generation",
};
export default mod;

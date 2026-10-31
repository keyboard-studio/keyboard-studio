// Per-question module: pf_doc_language_second (Phase F)
//
// The optional second language of a bilingual help page. Any pairing of
// English, the keyboard's language and another language can be expressed:
// release/sil/sil_yi is English + Chinese, sil_cameroon_azerty English + French,
// khmer_angkor English + Khmer. The second language never sets `<html lang>`:
// the author writes both languages inside each answer, so the page is tagged
// with the main language (pf_doc_language).

import type { QuestionModule } from "../../types.ts";
import { makeOptionalOptionValidator } from "../validators.ts";


export const definition = {
  id: "pf_doc_language_second",
  prompt: "Should the help page also be written in a second language?",
  help_text:
    "Some keyboards publish their help in two languages. If you add one, write " +
    "each answer in both languages and the help page will present them together.",
  type: "radio" as const,
  required: false,
  options: [
    { value: "none", label: "No, one language is enough" },
    { value: "english", label: "Also in English" },
    { value: "target", label: "Also in the language of the keyboard ({{language_name}})" },
    { value: "other", label: "Also in another language…" },
  ],
  next: [
    { condition: "value == 'other'", goto: "pf_doc_language_second_other" },
    { default: true, goto: "pf_usage_tip_2" },
  ],
} satisfies import("../../types.ts").FlowQuestion;

export const validate = makeOptionalOptionValidator(definition.options.map((o) => o.value), "Please choose one of the offered options.");

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "none", note: "single-language help" },
    { value: "english", note: "a non-English main language plus English" },
    { value: "target", note: "English main + the keyboard's language (khmer_angkor)" },
    { value: "other", note: "English main + a national language (sil_yi: Chinese)" },
    { value: "", note: "blank is fine — means no second language" },
    { value: undefined, note: "undefined is fine (optional)" },
  ],
  invalid: [
    { value: "bilingual", expectedCode: "invalid_option" },
  ],
};

const mod: QuestionModule = {
  definition,
  validate,
  fixtures,
  inputs: [],
  writes: [],
  provides: ["help-doc-language-second"], requires: ["help-doc-language"],
  specRef: "specs/061-help-docs-generation",
  // #2002's seed, in the spec 092 (T036) lookup-default shape: derived
  // from the identity phase's composed BCP47 tag (supplied by the live
  // wiring as ctx.phaseF.bcp47Tag) — an English or tag-less project
  // gets no second language; anything else is proposed its own language
  // as the second, the pair the old single "bilingual" answer proposed.
  // The author can overturn it.
  lookupDefault: (ctx) => {
    const tag = ctx.phaseF?.bcp47Tag;
    const primary = typeof tag === "string" ? tag.split("-")[0]?.toLowerCase() ?? "" : "";
    return {
      value: primary === "" || primary === "en" ? "none" : "target",
      source: "identity",
    };
  },
};
export default mod;

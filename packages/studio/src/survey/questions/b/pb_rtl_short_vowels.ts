// Per-question module: pb_rtl_short_vowels (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.

import type { QuestionModule } from "../../types.ts";
import { makeRequiredOptionValidator } from "../validators.ts";

export const definition = {
  id: "pb_rtl_short_vowels",
  prompt:
    "In your language, are the short vowel marks (the small marks above and below consonants) always written, sometimes written, or never written in normal text?",
  help_text:
    "In many right-to-left scripts, the short vowel marks (the small marks " +
    "placed above and below consonant letters to show vowel sounds) are left " +
    "out in everyday text but included in religious, educational, or " +
    "children's materials. In other scripts, they are always written. This " +
    "affects how the keyboard is laid out.",
  type: "radio" as const,
  required: true,
  options: [
    {
      value: "always",
      label: "Always written in normal text",
    },
    {
      value: "sometimes",
      label:
        "Sometimes written (for example, in educational or religious text only)",
    },
    {
      value: "never",
      label: "Never or almost never written",
    },
  ],
  // pb_rtl_direction_marks / _detail were retired by spec 075 (FR-019): the
  // invisible-characters spine step now asks about direction marks BY NAME for
  // every author, so the RTL branch goes straight on to special letters.
  next: "pb_rtl_special_letters",
} satisfies import("../../types.ts").FlowQuestion;


export const validate = makeRequiredOptionValidator(definition.options.map((o) => o.value), "Please choose how short vowel marks are used in your language.", (v) => `"${v}" is not a valid choice.`);

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "always", note: "tashkeel always written (e.g. Classical Arabic)" },
    { value: "sometimes", note: "written in educational/religious text only" },
    { value: "never", note: "bare consonant text only" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
    { value: "optional", expectedCode: "invalid_option" },
  ],
};


const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [], provides: ["rtl-short-vowels"], requires: ["non-roman-branch"] };
export default mod;

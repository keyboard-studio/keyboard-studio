// Per-question module: pb_non_roman_branch (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pb_non_roman_branch",
  prompt:
    "We will ask a few questions about how your writing system works.",
  help_text:
    "Non-Roman writing systems have their own rules for how letters are " +
    "shaped and combined. The next questions will help the studio understand " +
    "the structure of your script so it can suggest the right keyboard " +
    "pattern. Answer as well as you can -- if you are not sure, choose the " +
    "closest option and add a note.",
  type: "radio" as const,
  required: false,
  options: [
    {
      value: "indic",
      label:
        "Indic (South Asian scripts such as Devanagari, Bengali, Tamil, and similar)",
    },
    {
      value: "sea",
      label:
        "Southeast Asian (Thai, Khmer, Myanmar, Lao, and similar)",
    },
    {
      value: "rtl",
      label: "Right-to-left (Arabic, Hebrew, and similar)",
    },
    {
      value: "syllabic",
      label:
        "Syllabic (each character represents a syllable, e.g. Cherokee, Canadian Aboriginal Syllabics, Vai)",
    },
    {
      value: "alpha-nonlatin",
      label:
        "Non-Latin alphabet (Cyrillic, Greek, Georgian, Armenian -- letters, not syllables or attached marks)",
    },
    {
      value: "other",
      label: "Other or I am not sure",
    },
  ],
  next: [
    { condition: "value == 'indic'", goto: "pb_indic_conjuncts" },
    { condition: "value == 'sea'", goto: "pb_sea_medials" },
    { condition: "value == 'rtl'", goto: "pb_rtl_direction_confirm" },
    { condition: "value == 'syllabic'", goto: "pb_syllabic_note" },
    { condition: "value == 'alpha-nonlatin'", goto: "pb_special_letters" },
    { default: true, goto: "pb_other_free_entry" },
  ],
} satisfies import("../../types.ts").FlowQuestion;

// No validation: required: false; all values route to sub-branches.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "indic", note: "Indic scripts" },
    { value: "sea", note: "Southeast Asian scripts" },
    { value: "rtl", note: "Right-to-left scripts" },
    { value: "syllabic", note: "Syllabic scripts" },
    { value: "alpha-nonlatin", note: "Non-Latin alphabets" },
    { value: "other", note: "Unknown or other" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

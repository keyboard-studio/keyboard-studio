// Per-question module: pb_latin_qwerty_branch (Phase B)
// Ported verbatim from content/flows/phase_b_characters.yaml.
// Shown when routing_group == "qwerty-qwertz".

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pb_latin_qwerty_branch",
  prompt:
    "When you place an accent mark on a letter, does it always go on the same letter, or can it go on many different letters?",
  help_text:
    "In some languages the same accent mark is used on many different letters " +
    "-- for example, a tone mark that can appear on a, e, i, o, and u. In " +
    "others it only ever appears on one or two letters. This helps the studio " +
    "decide whether to put the mark on its own special key or to use an " +
    "accent key you press first that makes no letter by itself, then the base " +
    "letter.",
  type: "radio" as const,
  required: false,
  options: [
    {
      value: "many-bases",
      label: "The same accent can go on many different letters",
    },
    {
      value: "few-bases",
      label: "Each accent only goes on one or two specific letters",
    },
    {
      value: "not-applicable",
      label: "My language does not use accents",
    },
  ],
  next: "pb_spare_keys_qwerty",
} satisfies import("../../types.ts").FlowQuestion;

// No validate: required: false advisory question.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "many-bases", note: "dead-key pattern preferred" },
    { value: "few-bases", note: "direct-key pattern preferred" },
    { value: "not-applicable", note: "no accents" },
    { value: undefined, note: "optional — blank is fine" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

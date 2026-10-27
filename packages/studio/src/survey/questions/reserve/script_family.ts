// Per-question module: script_family (Phase A)
// Ported verbatim from content/flows/phase_a_identity.yaml.
// Shown only when layout_family == 'non-roman'.

import type { QuestionModule } from "../../types.ts";
import { makeRequiredFirstOptionValidator } from "../validators.ts";


export const definition = {
  id: "script_family",
  prompt: "What type of non-Roman script does your keyboard use?",
  help_text:
    "Different script families need different internal structures. Choose " +
    "the group that best describes your writing system. If you are unsure, " +
    "pick \"Other\" and the studio will ask follow-up questions later.",
  type: "radio" as const,
  required: true,
  options: [
    { value: "indic", label: "Indic (scripts from South Asia such as Devanagari, Bengali, Tamil)" },
    { value: "sea", label: "Southeast Asian (Thai, Khmer, Myanmar, Lao, and similar scripts)" },
    { value: "rtl", label: "Right-to-left (Arabic, Hebrew, and similar scripts)" },
    { value: "syllabic", label: "Syllabic (each glyph represents a syllable or syllable unit, e.g. Cherokee, Canadian Aboriginal Syllabics, Vai)" },
    { value: "alpha-nonlatin", label: "Non-Latin alphabet (Coptic, Tifinagh, Adlam -- letters, not syllables or attached marks)" },
    { value: "other", label: "Other or I am not sure" },
  ],
  next: "pa_primary_target",
} satisfies import("../../types.ts").FlowQuestion;

export const validate = makeRequiredFirstOptionValidator(definition.options.map((o) => o.value), "Please select a script family.", (v) => `"${v}" is not a recognised script family.`);

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "indic", note: "South Asian scripts" },
    { value: "sea", note: "Southeast Asian scripts" },
    { value: "rtl", note: "right-to-left scripts" },
    { value: "syllabic", note: "syllabic scripts" },
    { value: "alpha-nonlatin", note: "non-Latin alphabets" },
    { value: "other", note: "catch-all option" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
    { value: "cjk", expectedCode: "invalid_option", note: "not a valid family value" },
  ],
};


const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [], provides: ["reserve-script-family"], requires: ["reserve-layout-family"] };
export default mod;

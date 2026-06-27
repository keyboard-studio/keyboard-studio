// Per-question module: primary_script (Phase A)
// Ported verbatim from content/flows/phase_a_identity.yaml.

import type { QuestionModule, ValidationResult } from "../../types.ts";

import { irPath } from "@keyboard-studio/contracts";

const VALID_SCRIPT_VALUES = new Set([
  "Latn", "Arab", "Hebr", "Deva", "Beng", "Taml", "Telu", "Knda", "Mlym",
  "Guru", "Gujr", "Orya", "Sinh", "Thai", "Khmr", "Mymr", "Laoo", "Ethi",
  "Hang", "Hani", "Geor", "Armn", "Cyrl", "Grek", "Tibt", "Cans", "Cher",
  "Other",
]);

export const definition = {
  id: "primary_script",
  prompt: "Which writing system does your language use?",
  help_text:
    "Choose the alphabet or script your language is normally written in. " +
    "If your language uses more than one script, pick the one this keyboard " +
    "is for.",
  type: "select" as const,
  required: true,
  options: [
    { value: "Latn", label: "Latin (A, B, C, and accented letters like é, ñ, ŋ)" },
    { value: "Arab", label: "Arabic" },
    { value: "Hebr", label: "Hebrew" },
    { value: "Deva", label: "Devanagari (used for Hindi, Nepali, Marathi, and others)" },
    { value: "Beng", label: "Bengali" },
    { value: "Taml", label: "Tamil" },
    { value: "Telu", label: "Telugu" },
    { value: "Knda", label: "Kannada" },
    { value: "Mlym", label: "Malayalam" },
    { value: "Guru", label: "Gurmukhi (Punjabi)" },
    { value: "Gujr", label: "Gujarati" },
    { value: "Orya", label: "Odia" },
    { value: "Sinh", label: "Sinhala" },
    { value: "Thai", label: "Thai" },
    { value: "Khmr", label: "Khmer" },
    { value: "Mymr", label: "Myanmar / Burmese" },
    { value: "Laoo", label: "Lao" },
    { value: "Ethi", label: "Ethiopic (Ge'ez, Amharic, Tigrinya, and others)" },
    { value: "Hang", label: "Hangul (Korean)" },
    { value: "Hani", label: "Chinese, Japanese, or other Han-character script (Chinese Hanzi, Japanese Kanji/kana, and similar)" },
    { value: "Geor", label: "Georgian" },
    { value: "Armn", label: "Armenian" },
    { value: "Cyrl", label: "Cyrillic (Russian, Ukrainian, Serbian, and others)" },
    { value: "Grek", label: "Greek" },
    { value: "Tibt", label: "Tibetan" },
    { value: "Cans", label: "Canadian Aboriginal Syllabics" },
    { value: "Cher", label: "Cherokee" },
    { value: "Other", label: "A different writing system not listed here" },
  ],
  next: [
    { condition: "value == 'Ethi' or value == 'Hang' or value == 'Hani'", goto: "script_not_supported_stub" },
    { condition: "value == 'Arab' or value == 'Hebr'", goto: "writing_direction" },
    { condition: "value == 'Latn' or value == 'Cyrl' or value == 'Grek' or value == 'Geor' or value == 'Armn'", goto: "layout_family" },
    { default: true as const, goto: "layout_family" },
  ],
} satisfies import("../../types.ts").FlowQuestion;

export function validate(
  value: string | string[] | undefined,
): ValidationResult {
  const v = typeof value === "string" ? value : Array.isArray(value) ? value[0] ?? "" : "";

  if (v.length === 0) {
    return { ok: false, code: "required", message: "Please select a writing system." };
  }
  if (!VALID_SCRIPT_VALUES.has(v)) {
    return { ok: false, code: "invalid_option", message: `"${v}" is not a recognised script option.` };
  }
  return { ok: true };
}

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "Latn", note: "Latin script" },
    { value: "Arab", note: "Arabic script" },
    { value: "Deva", note: "Devanagari" },
    { value: "Other", note: "catch-all option" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
    { value: "xxxx", expectedCode: "invalid_option", note: "unknown script code" },
  ],
};


const mod: QuestionModule = {
  definition,
  validate,
  fixtures,
  inputs: [],
  writes: [irPath("header", "bcp47")],
};
export default mod;

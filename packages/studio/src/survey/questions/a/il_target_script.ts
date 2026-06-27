// Per-question module: il_target_script (identity-lite)
// Ported verbatim from content/flows/identity_lite.yaml.
//
// The chosen script — not the language — drives routing, the A2 axis, base
// suggestion, and the inventory diff (spec §8/§9). CJK/Ethiopic/Hangul are
// stub-gated to il_script_not_supported consistent with §9 three-group routing.

import type { QuestionModule, ValidationResult } from "../../types.ts";

const VALID_SCRIPT_VALUES = new Set([
  "Latn", "romanization-Latn", "fonipa",
  "Arab", "Hebr", "Deva", "Cyrl", "Grek", "Geor", "Armn",
  "Ethi", "Hani", "Hang", "other",
]);

export const definition = {
  id: "il_target_script",
  prompt: "Which script will THIS keyboard type?",
  help_text:
    "Choose the writing system this keyboard produces. It can differ from the " +
    "script your language normally uses: pick \"Latin romanization\" or \"IPA\" if " +
    "you are building a romanized or phonetic keyboard. The script you choose " +
    "here — not the language — decides the keyboard's layout family.",
  type: "select" as const,
  required: true,
  options: [
    { value: "Latn", label: "Latin (A–Z and accented letters like é, ñ, ŋ)" },
    { value: "romanization-Latn", label: "Latin romanization (the keyboard produces Latin letters A–Z and diacritics)" },
    { value: "fonipa", label: "IPA — phonetic transcription (Latin-based)" },
    { value: "Arab", label: "Arabic" },
    { value: "Hebr", label: "Hebrew" },
    { value: "Deva", label: "Devanagari (Hindi, Nepali, Marathi, and others)" },
    { value: "Cyrl", label: "Cyrillic (Russian, Ukrainian, Serbian, and others)" },
    { value: "Grek", label: "Greek" },
    { value: "Geor", label: "Georgian" },
    { value: "Armn", label: "Armenian" },
    { value: "Ethi", label: "Ethiopic (Ge'ez, Amharic, Tigrinya — not yet supported)" },
    { value: "Hani", label: "Chinese / Japanese Han characters (not yet supported)" },
    { value: "Hang", label: "Hangul (Korean — not yet supported)" },
    { value: "other", label: "Another script not listed here" },
  ],
  next: [
    { condition: "value == 'Ethi' or value == 'Hani' or value == 'Hang'", goto: "il_script_not_supported" },
    { default: true as const, goto: null },
  ],
} satisfies import("../../types.ts").FlowQuestion;

export function validate(
  value: string | string[] | undefined,
): ValidationResult {
  const v = typeof value === "string" ? value : Array.isArray(value) ? (value[0] ?? "") : "";
  if (v.length === 0) {
    return { ok: false, code: "required", message: "Please select a writing system." };
  }
  if (!VALID_SCRIPT_VALUES.has(v)) {
    return { ok: false, code: "invalid_option", message: `"${v}" is not a recognised script option.` };
  }
  return { ok: true };
}

// mutate: STUB — KeyboardIR mutation surface is not yet a real contract.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "Latn", note: "Latin script — routes to default (null terminal)" },
    { value: "fonipa", note: "IPA — routes to default (null terminal)" },
    { value: "romanization-Latn", note: "Latin romanization" },
    { value: "Ethi", note: "Ethiopic — routes to il_script_not_supported" },
    { value: "Hani", note: "Han — routes to il_script_not_supported" },
    { value: "Hang", note: "Hangul — routes to il_script_not_supported" },
    { value: "other", note: "catch-all option" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
    { value: "xxxx", expectedCode: "invalid_option", note: "unknown script code" },
  ],
};

const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;

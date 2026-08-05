// Per-question module: q_sa3_latin_flavor (spec 038 US1, script-alignment).
//
// A §3c CONFIRMATION rendered conditionally via the adaptation firing surface
// (see q_sa1_target_script_spread.ts header for the reserve-module rationale and
// why it is NOT in the linear Phase B flow — SC-002). Latin target only: fires
// when the base carries a non-plain Latin sub-profile (extended or IPA) that a
// plain-Latin start would not assume. Resolves for
// content/adaptation-questions/q_sa3_latin_flavor.yaml and the
// orth.regional-variant facet consumer entry.

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "q_sa3_latin_flavor",
  prompt: "Which Latin sub-profile should this keyboard follow?",
  help_text:
    "The base keyboard uses a richer Latin sub-profile than a plain-Latin " +
    "start would assume. Plain covers the basic Latin letters; extended adds " +
    "accented/African-Latin letters; IPA covers phonetic symbols. Confirm the " +
    "profile that matches your orthography.",
  type: "radio" as const,
  required: true,
  options: [
    { value: "plain", label: "Plain Latin" },
    { value: "extended", label: "Extended Latin (accented / African letters)" },
    { value: "ipa", label: "IPA / phonetic" },
  ],
  next: null,
} satisfies import("../../types.ts").FlowQuestion;

const VALID_VALUES = new Set(["plain", "extended", "ipa"]);

export function validate(value: string | string[] | undefined): ValidationResult {
  const v = typeof value === "string" ? value : "";
  if (!v) {
    return { ok: false, code: "required", message: "Please choose a Latin sub-profile." };
  }
  if (!VALID_VALUES.has(v)) {
    return { ok: false, code: "invalid_option", message: `"${v}" is not a valid choice.` };
  }
  return { ok: true };
}

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "plain", note: "plain Latin" },
    { value: "extended", note: "extended Latin" },
    { value: "ipa", note: "IPA / phonetic" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
    { value: "cyrillic", expectedCode: "invalid_option", note: "not a Latin sub-profile" },
  ],
};

const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;

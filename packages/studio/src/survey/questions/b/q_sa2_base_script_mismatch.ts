// Per-question module: q_sa2_base_script_mismatch (spec 038 US1, script-alignment).
//
// A §3c CONFIRMATION rendered conditionally via the adaptation firing surface
// (see q_sa1_target_script_spread.ts header for the reserve-module rationale and
// why it is NOT in the linear Phase B flow — SC-002). Fires when the chosen
// base's dominant script disagrees with the target, or the base is script-mixed
// under the trust threshold (Q-TP1). Resolves for
// content/adaptation-questions/q_sa2_base_script_mismatch.yaml and the
// lineage.nearest-neighbors facet consumer entry.

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "q_sa2_base_script_mismatch",
  prompt:
    "This starting keyboard's own script differs from the script you chose. Retarget it to your script?",
  help_text:
    "The base keyboard you picked was written for a different (or mixed) " +
    "script. We can retarget its layout to the script you chose, or keep the " +
    "base's script if you picked it on purpose.",
  type: "radio" as const,
  required: true,
  options: [
    { value: "retarget", label: "Retarget to the script I chose" },
    { value: "keep-base", label: "Keep the base keyboard's script" },
  ],
  next: null,
} satisfies import("../../types.ts").FlowQuestion;

const VALID_VALUES = new Set(["retarget", "keep-base"]);

export function validate(value: string | string[] | undefined): ValidationResult {
  const v = typeof value === "string" ? value : "";
  if (!v) {
    return { ok: false, code: "required", message: "Please confirm the base keyboard's script." };
  }
  if (!VALID_VALUES.has(v)) {
    return { ok: false, code: "invalid_option", message: `"${v}" is not a valid choice.` };
  }
  return { ok: true };
}

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "retarget", note: "align the base to the chosen script" },
    { value: "keep-base", note: "keep the base's own script" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
    { value: "mixed", expectedCode: "invalid_option", note: "not a confirmation value" },
  ],
};

const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;

// Per-question module: q_tp2_fallback_tier_prefill (spec 038 US3, trust-policy).
//
// The trust dial rendered at the workflow-defaults step, NOT the linear Phase B
// character walk. RESERVE module (see q_ip1_keep_strategies.ts for the full
// rationale): on disk so adaptation-catalog-lint / facet-lint resolve
// content/adaptation-questions/q_tp2_fallback_tier_prefill.yaml (renders: true);
// intentionally NOT registered nor flow-listed (SC-002 / SC-003). Fallback-tier
// classifications stay visually distinguishable wherever they prefill regardless
// of this dial (FR-006); this governs only whether the prefill is offered or
// nulled to the ask form. Honest default: allow.

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "q_tp2_fallback_tier_prefill",
  prompt:
    "May a base known only from a language-default (fallback) tier prefill its values, or should it always be asked plainly?",
  help_text:
    "Fallback-tier evidence is the weakest tier. Either way its prefills are " +
    "clearly marked as fallback; this only decides whether the value is offered " +
    "or shown as a plain ask. The default is to allow it.",
  type: "radio" as const,
  required: true,
  options: [
    { value: "allow", label: "Allow fallback-tier prefills (default, always marked)" },
    { value: "ask", label: "Always ask plainly for fallback-tier bases" },
  ],
  next: null,
} satisfies import("../../types.ts").FlowQuestion;

const VALID_VALUES = new Set(["allow", "ask"]);

export function validate(value: string | string[] | undefined): ValidationResult {
  const v = typeof value === "string" ? value : "";
  if (!v) {
    return { ok: false, code: "required", message: "Please choose a fallback-tier policy." };
  }
  if (!VALID_VALUES.has(v)) {
    return { ok: false, code: "invalid_option", message: `"${v}" is not a valid choice.` };
  }
  return { ok: true };
}

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "allow", note: "the honest default — prefill but mark it" },
    { value: "ask", note: "route fallback-tier bases to a plain ask" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
    { value: "deny", expectedCode: "invalid_option", note: "not one of the two values" },
  ],
};

const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;

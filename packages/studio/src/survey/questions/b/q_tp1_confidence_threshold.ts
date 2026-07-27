// Per-question module: q_tp1_confidence_threshold (spec 038 US3, trust-policy).
//
// The trust dial rendered at the workflow-defaults step, NOT the linear Phase B
// character walk. RESERVE module (see q_ip1_keep_strategies.ts for the full
// rationale): on disk so adaptation-catalog-lint / facet-lint resolve
// content/adaptation-questions/q_tp1_confidence_threshold.yaml (renders: true);
// intentionally NOT registered nor flow-listed (SC-002 / SC-003). Its honest
// default (80%) IS its no-evidence form — a workflow that never opens the trust
// step runs on exactly that (FR-004).

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "q_tp1_confidence_threshold",
  prompt:
    "How confident should the evidence be before the studio treats a base as single-script and prefills its script for you?",
  help_text:
    "Lower this to prefill more aggressively (a mixed base is treated as " +
    "single-script, and the chip says so); raise it to route borderline bases to " +
    "a plain confirmation instead. The default is 80%.",
  type: "radio" as const,
  required: true,
  options: [
    { value: "0.6", label: "60% — prefill readily" },
    { value: "0.8", label: "80% — balanced (default)" },
    { value: "0.95", label: "95% — ask unless nearly certain" },
  ],
  next: null,
} satisfies import("../../types.ts").FlowQuestion;

const VALID_VALUES = new Set(["0.6", "0.8", "0.95"]);

export function validate(value: string | string[] | undefined): ValidationResult {
  const v = typeof value === "string" ? value : "";
  if (!v) {
    return { ok: false, code: "required", message: "Please choose a confidence threshold." };
  }
  if (!VALID_VALUES.has(v)) {
    return { ok: false, code: "invalid_option", message: `"${v}" is not a valid threshold.` };
  }
  return { ok: true };
}

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "0.6", note: "aggressive prefill" },
    { value: "0.8", note: "the honest default" },
    { value: "0.95", note: "conservative — ask more" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
    { value: "1.5", expectedCode: "invalid_option", note: "out of the offered range" },
  ],
};

const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;

// Per-question module: q_ip2_keep_device_targets (spec 038 US2, inheritance-posture).
//
// A §3c CONFIRMATION rendered through the InheritancePostureStep, NOT the linear
// Phase B walk. RESERVE module (see q_ip1_keep_strategies.ts for the full
// rationale): on disk so adaptation-catalog-lint / facet-lint resolve
// content/adaptation-questions/q_ip2_keep_device_targets.yaml (renders: true) and
// the env.device-mix facet `consumers.prefills` entry; intentionally NOT
// registered nor flow-listed (SC-002 / SC-003). Fires only when the base ships a
// different device mix than the author declared. Routes to the existing Phase B /
// mobile-touch-derivation flow; it does not author touch here (Article VII).

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "q_ip2_keep_device_targets",
  prompt:
    "Your starting keyboard targets a different set of devices than you declared. Keep the base's device targets, or use the ones you declared?",
  help_text:
    "Keeping the base's targets carries its touch/web layers forward; using your " +
    "declared mix routes touch work through the normal derivation flow. You can " +
    "confirm either — nothing is applied silently.",
  type: "radio" as const,
  required: true,
  options: [
    { value: "keep", label: "Keep the base's device targets" },
    { value: "propose", label: "Use the device targets I declared" },
    { value: "discard", label: "Desktop only" },
  ],
  next: null,
} satisfies import("../../types.ts").FlowQuestion;

const VALID_VALUES = new Set(["keep", "propose", "discard"]);

export function validate(value: string | string[] | undefined): ValidationResult {
  const v = typeof value === "string" ? value : "";
  if (!v) {
    return { ok: false, code: "required", message: "Please choose a device-target posture." };
  }
  if (!VALID_VALUES.has(v)) {
    return { ok: false, code: "invalid_option", message: `"${v}" is not a valid choice.` };
  }
  return { ok: true };
}

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "keep", note: "inherit the base device mix" },
    { value: "propose", note: "use the declared device mix" },
    { value: "discard", note: "desktop-only" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
    { value: "mobile", expectedCode: "invalid_option", note: "not a posture value" },
  ],
};

const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;

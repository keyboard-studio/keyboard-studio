// Per-question module: q_ip1_keep_strategies (spec 038 US2, inheritance-posture).
//
// A §3c CONFIRMATION rendered through the InheritancePostureStep (one keep/
// propose/discard answer governs every input-strategy proposal site — the
// en-masse lever, FR-005), NOT through the linear Phase B walk. Like the q_sa*
// script-alignment modules, this is a RESERVE module: it exists on disk so
// adaptation-catalog-lint / facet-lint (which key off the raw `id` literal)
// resolve content/adaptation-questions/q_ip1_keep_strategies.yaml (renders: true)
// and the lineage.strategy-fingerprint facet `consumers.prefills` entry. It is
// intentionally NOT registered in registry.b.ts nor listed in the Phase B flow:
// forcing it into the linear `questions:` list would make it render on every
// character walk, violating the non-interruption bar (SC-002 / SC-003). It fires
// only when the base has a recognized strategy fingerprint.

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "q_ip1_keep_strategies",
  prompt:
    "Your starting keyboard has a recognized set of input strategies. Keep them, let the studio re-propose, or discard them for this keyboard?",
  help_text:
    "This one choice governs every input-strategy proposal in this session. " +
    "You can still override any individual proposal later — that override stays " +
    "local and does not change this posture.",
  type: "radio" as const,
  required: true,
  options: [
    { value: "keep", label: "Keep the base's input strategies" },
    { value: "propose", label: "Let the studio re-propose from scratch" },
    { value: "discard", label: "Discard them" },
  ],
  next: null,
} satisfies import("../../types.ts").FlowQuestion;

const VALID_VALUES = new Set(["keep", "propose", "discard"]);

export function validate(value: string | string[] | undefined): ValidationResult {
  const v = typeof value === "string" ? value : "";
  if (!v) {
    return { ok: false, code: "required", message: "Please choose a strategy posture." };
  }
  if (!VALID_VALUES.has(v)) {
    return { ok: false, code: "invalid_option", message: `"${v}" is not a valid choice.` };
  }
  return { ok: true };
}

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "keep", note: "inherit the base fingerprint wholesale" },
    { value: "propose", note: "re-derive strategies" },
    { value: "discard", note: "drop the base strategies" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
    { value: "maybe", expectedCode: "invalid_option", note: "not a posture value" },
  ],
};

const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;

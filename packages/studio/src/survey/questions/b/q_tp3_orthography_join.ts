// Per-question module: q_tp3_orthography_join (spec 038 US3, trust-policy).
//
// The ONLY path a named-orthography label enters the session (FR-009): an
// author-confirmed opt-in join, never inferred. Rendered as a §3c opt-in, NOT the
// linear Phase B character walk. RESERVE module (see q_ip1_keep_strategies.ts for
// the full rationale): on disk so adaptation-catalog-lint / facet-lint resolve
// content/adaptation-questions/q_tp3_orthography_join.yaml (renders: true) and the
// community.multi-orthography facet `consumers.prefills` entry; intentionally NOT
// registered nor flow-listed (SC-002 / SC-003). record-no-default: with no
// explicit opt-in nothing is joined.

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "q_tp3_orthography_join",
  prompt:
    "Related keyboards exist in an alternate script for a known family. Join this keyboard to that named orthography community?",
  help_text:
    "This is the only way a named orthography label is attached — always by your " +
    "explicit opt-in, never inferred. Declining leaves the keyboard unlabelled.",
  type: "radio" as const,
  required: true,
  options: [
    { value: "join", label: "Join the named orthography community" },
    { value: "decline", label: "Do not join" },
  ],
  next: null,
} satisfies import("../../types.ts").FlowQuestion;

const VALID_VALUES = new Set(["join", "decline"]);

export function validate(value: string | string[] | undefined): ValidationResult {
  const v = typeof value === "string" ? value : "";
  if (!v) {
    return { ok: false, code: "required", message: "Please choose whether to join the orthography community." };
  }
  if (!VALID_VALUES.has(v)) {
    return { ok: false, code: "invalid_option", message: `"${v}" is not a valid choice.` };
  }
  return { ok: true };
}

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "join", note: "explicit opt-in — the only path a label enters (FR-009)" },
    { value: "decline", note: "no named orthography joined" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
    { value: "auto", expectedCode: "invalid_option", note: "joins are never automatic" },
  ],
};

const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;

// Per-question module: q_sa1_target_script_spread (spec 038 US1, script-alignment).
//
// A §3c CONFIRMATION rendered CONDITIONALLY through the adaptation firing
// surface (adaptation/firing.ts -> survey/Prefill.tsx buildScriptAlignmentRows),
// NOT through the linear Phase B walk. It is deliberately a reserve module: it is
// resolved by facet-lint / adaptation-catalog-lint (which key off the raw `id`
// literal) so content/adaptation-questions/q_sa1_target_script_spread.yaml
// (renders: true) and the lineage.siblings / community.multi-orthography facet
// `consumers.prefills` entries resolve. It is intentionally NOT registered in
// registry.b.ts nor listed in the Phase B flow: forcing it into the linear
// `questions:` list would make it edge-reachable (drift-guardrail bijection) and
// therefore render on EVERY character walk, violating the feature's headline
// non-interruption bar (SC-002 / SC-003). It fires only when related keyboards
// span more than one script.

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "q_sa1_target_script_spread",
  prompt:
    "Related keyboards for your language already exist in more than one script. Which script community should this keyboard serve?",
  help_text:
    "We found published keyboards for related languages in more than one " +
    "script. This keyboard serves the script you chose during identity. " +
    "Confirm that, or reconsider if a different script fits your community " +
    "better.",
  type: "radio" as const,
  required: true,
  options: [
    { value: "keep", label: "Serve the script I chose" },
    { value: "reconsider", label: "Let me reconsider the script" },
  ],
  next: null,
} satisfies import("../../types.ts").FlowQuestion;

const VALID_VALUES = new Set(["keep", "reconsider"]);

export function validate(value: string | string[] | undefined): ValidationResult {
  const v = typeof value === "string" ? value : "";
  if (!v) {
    return { ok: false, code: "required", message: "Please confirm which script this keyboard serves." };
  }
  if (!VALID_VALUES.has(v)) {
    return { ok: false, code: "invalid_option", message: `"${v}" is not a valid choice.` };
  }
  return { ok: true };
}

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "keep", note: "confirm the chosen target script" },
    { value: "reconsider", note: "reopen the script choice" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
    { value: "arabic", expectedCode: "invalid_option", note: "not one of the two confirmation values" },
  ],
};

const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;

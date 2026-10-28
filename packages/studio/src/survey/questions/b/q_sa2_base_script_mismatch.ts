// Per-question module: q_sa2_base_script_mismatch (spec 038 US1, script-alignment).
//
// A §3c CONFIRMATION rendered conditionally via the adaptation firing surface
// (see q_sa1_target_script_spread.ts header for the reserve-module rationale and
// why it is NOT in the linear Phase B flow — SC-002). Fires when the chosen
// base's dominant script disagrees with the target, or the base is script-mixed
// under the trust threshold (Q-TP1). Resolves for
// content/adaptation-questions/q_sa2_base_script_mismatch.yaml and the
// lineage.nearest-neighbors facet consumer entry.

import type { QuestionModule } from "../../types.ts";
import { makeRequiredOptionValidator } from "../validators.ts";

export const definition = {
  id: "q_sa2_base_script_mismatch",
  prompt:
    "This starting keyboard's own script differs from the script you chose. Retarget it to your script?",
  help_text:
    "The starting keyboard you picked was written for a different (or mixed) " +
    "script. We can retarget its layout to the script you chose, or keep the " +
    "starting keyboard's script if you picked it on purpose.",
  type: "radio" as const,
  required: true,
  options: [
    { value: "retarget", label: "Retarget to the script I chose" },
    { value: "keep-base", label: "Keep the starting keyboard's script" },
  ],
  next: null,
} satisfies import("../../types.ts").FlowQuestion;


export const validate = makeRequiredOptionValidator(definition.options.map((o) => o.value), "Please confirm the starting keyboard's script.", (v) => `"${v}" is not a valid choice.`);

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "retarget", note: "align the starting keyboard to the chosen script" },
    { value: "keep-base", note: "keep the starting keyboard's own script" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
    { value: "mixed", expectedCode: "invalid_option", note: "not a confirmation value" },
  ],
};

const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [], provides: ["sa2-base-script-mismatch"] };
export default mod;

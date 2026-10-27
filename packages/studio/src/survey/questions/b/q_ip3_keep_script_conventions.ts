// Per-question module: q_ip3_keep_script_conventions (spec 038 US2, inheritance-posture).
//
// A §3c CONFIRMATION, NOT the linear Phase B walk. RESERVE module (see
// q_ip1_keep_strategies.ts for the full rationale): on disk so
// adaptation-catalog-lint / facet-lint resolve
// content/adaptation-questions/q_ip3_keep_script_conventions.yaml (renders: true)
// and the community.input-conventions facet `consumers.prefills` entry;
// intentionally NOT registered nor flow-listed (SC-002 / SC-003). Fires only when
// the base's neutral residue carries script variants (record-no-default: residue
// is not a confident signal, so nothing is prefilled by default).

import type { QuestionModule } from "../../types.ts";
import { makeRequiredOptionValidator } from "../validators.ts";

export const definition = {
  id: "q_ip3_keep_script_conventions",
  prompt:
    "Your starting keyboard's residual rules carry script conventions (ordering, normalization). Keep them, re-propose, or discard?",
  help_text:
    "These are the starting keyboard's habits the studio could not classify confidently. " +
    "There is no default here — record what you want and the studio applies it " +
    "to every convention proposal at once.",
  type: "radio" as const,
  required: true,
  options: [
    { value: "keep", label: "Keep the starting keyboard's script conventions" },
    { value: "propose", label: "Let the studio re-propose" },
    { value: "discard", label: "Discard them" },
  ],
  next: null,
} satisfies import("../../types.ts").FlowQuestion;


export const validate = makeRequiredOptionValidator(definition.options.map((o) => o.value), "Please choose a script-conventions posture.", (v) => `"${v}" is not a valid choice.`);

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "keep", note: "inherit the starting keyboard's conventions" },
    { value: "propose", note: "re-derive conventions" },
    { value: "discard", note: "drop the starting keyboard's conventions" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
    { value: "sometimes", expectedCode: "invalid_option", note: "not a posture value" },
  ],
};

const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [], provides: ["ip3-keep-script-conventions"] };
export default mod;

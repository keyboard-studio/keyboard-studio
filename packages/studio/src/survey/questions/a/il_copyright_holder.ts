// Per-question module: il_copyright_holder (identity-lite, spec 037 US1)
//
// See il_author_name.ts for why identity-lite uses its own ids rather than
// reviving the demoted phase_a modules directly.
//
// TERMINAL for identity-lite (`next: null`), whereas the demoted
// pa_copyright_holder continues to provenance_opt_in. That divergence is exactly
// why a separate id is needed.
//
// NOT required: per D1 the holder defaults to the author name when left blank,
// so an author who is also the rights holder confirms one field instead of two.

import type { QuestionModule } from "../../types.ts";
import paCopyrightHolder from "./pa_copyright_holder.ts";

export const definition = {
  ...paCopyrightHolder.definition,
  id: "il_copyright_holder",
  required: false,
  next: null,
} satisfies import("../../types.ts").FlowQuestion;

// No validate(): required:false, because a blank means "same as the author"
// (D1 / effectiveHolder), not a missing answer.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    ...paCopyrightHolder.fixtures.valid,
    { value: "", note: "blank defaults to the author name (D1)" },
    { value: undefined, note: "undefined is fine (optional)" },
  ],
  invalid: [],
};

const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

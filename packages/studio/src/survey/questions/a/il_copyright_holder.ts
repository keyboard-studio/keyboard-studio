// Per-question module: il_copyright_holder (identity-lite, spec 059 US1)
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
import paCopyrightHolder from "../reserve/pa_copyright_holder.ts";

// help_text extends the demoted module's rather than replacing it (HANDOFF-CONTENT
// item 5, route B): the base wording is still correct, but only identity-lite has
// attribution accumulation behind it, so only here does the author need telling
// that a derived keyboard's original notice is retained for them.
//
// This is a correctness guard, not polish. An author crediting the base author by
// hand gets a result that depends on exact spelling — `SIL␣␣International` with a
// double space emits TWO copyright holders for one organisation in a legal notice.
// Dedupe is exact-match by decision D4 (fuzzy matching would collapse the live
// `SIL International` → `SIL Global` rename, which 280 and 152 shipped keyboards
// still use respectively), so this cannot be fixed by smarter matching downstream
// — only by not inviting the re-entry in the first place.
//
// Composed from the base string so Content's edits there still flow through here.
export const definition = {
  ...paCopyrightHolder.definition,
  id: "il_copyright_holder",
  required: false,
  next: null,
  help_text:
    // The base string ends on an unpunctuated `Example: '...'`, so the join
    // supplies the sentence break.
    paCopyrightHolder.definition.help_text +
    ". If this keyboard is based on an existing one, the original author's copyright " +
    "is kept automatically and does not need re-entering here.",
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

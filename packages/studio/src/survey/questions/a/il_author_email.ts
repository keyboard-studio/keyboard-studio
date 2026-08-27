// Per-question module: il_author_email (identity-lite, spec 064 US1)
//
// See il_author_name.ts for why identity-lite uses its own ids rather than
// reviving the demoted phase_a modules directly.
//
// NOT required here, unlike the demoted author_contact_email. A GitHub profile
// email is often private (D7), and spec 064 states an absent email must never
// block emission — it is optional metadata that lands in .kps <Author URL="mailto:…">
// and pre-fills the Phase F contact question (FR-016).
//
// prompt/help_text extend the demoted module's rather than replacing it
// (HANDOFF-CONTENT item 3, route B): only identity-lite makes this field
// optional, so only here does the prompt need to say so (Phase F "(optional)"
// convention).

import type { QuestionModule } from "../../types.ts";
import authorContactEmail from "../reserve/author_contact_email.ts";

export const definition = {
  ...authorContactEmail.definition,
  id: "il_author_email",
  required: false,
  next: "il_copyright_holder",
  prompt: authorContactEmail.definition.prompt + " (optional)",
  help_text:
    authorContactEmail.definition.help_text +
    " This is optional — leave it blank if you would rather not share an " +
    "email address (for example, if your GitHub profile email is private).",
} satisfies import("../../types.ts").FlowQuestion;

// No validate(): required:false. The demoted module's non-empty check would
// reject the blank a private-email author legitimately leaves.
//
// `format: "email"` IS inherited from the spread below, though — SurveyRunner's
// canAdvance applies it only when non-blank, so a private/blank email still
// passes while a non-blank, malformed one blocks Continue (spec 059 follow-up).

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    ...authorContactEmail.fixtures.valid,
    { value: "", note: "blank is fine — GitHub profile email may be private" },
    { value: undefined, note: "undefined is fine (optional)" },
  ],
  invalid: [],
};

const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;

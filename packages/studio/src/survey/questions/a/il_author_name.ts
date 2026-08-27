// Per-question module: il_author_name (identity-lite, spec 064 US1)
//
// WHY A NEW ID RATHER THAN REVIVING author_display_name
// -----------------------------------------------------
// Routing lives in each module's `definition.next` (loadModularFlow ROUTING
// DECISION B), so a module can belong to exactly ONE flow chain. The demoted
// `author_display_name` continues to `author_contact_email` and then
// `pa_copyright_holder` -> `provenance_opt_in`, and `provenance_opt_in` is not a
// member of identity_lite. Adding those ids to identity_lite would therefore
// dead-end at an unresolved goto, and repointing their `next` would break the
// proposed phase_a_identity graph they still belong to.
//
// So identity-lite gets its own thin ids that IMPORT the Content-authored prompt
// and help text from the demoted modules and override only `id` and `next`. That
// keeps one source of survey copy (Article VI: prompt text is Content-owned;
// Engine authors none here) and leaves the demoted modules byte-identical for the
// no-delete guardrail.
//
// Those modules live under `questions/reserve/` — relocated there wholesale (#1318)
// so the Flow Map's live drill-downs stop rendering them as reserve clutter. They
// remain registered, on disk, and test-covered, which is what makes this import a
// stable seam rather than a reference into something on its way out.

import type { QuestionModule, ValidationResult } from "../../types.ts";
import authorDisplayName from "../reserve/author_display_name.ts";

export const definition = {
  ...authorDisplayName.definition,
  id: "il_author_name",
  // May arrive pre-filled from the authenticated GitHub profile (D7), or blank
  // on resume/guest/no-name paths — prompt is neutral (see
  // reserve/author_display_name.ts) so it reads correctly either way.
  next: "il_author_email",
} satisfies import("../../types.ts").FlowQuestion;

/** Reuses the demoted module's validator — same rule, one implementation. */
export function validate(
  value: string | string[] | undefined,
): ValidationResult {
  return authorDisplayName.validate!(value);
}

export const fixtures: QuestionModule["fixtures"] = authorDisplayName.fixtures;

const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;

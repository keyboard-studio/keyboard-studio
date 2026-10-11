// Per-question module: il_author_name (attribution flow — spec 064 US1, moved post-track by #1901)
//
// WHY A NEW ID RATHER THAN REVIVING author_display_name
// -----------------------------------------------------
// Routing lives in each module's `definition.next` (the derived flow loader, loadDerivedFlowDef,
// follows `next` edges), so a module can belong to exactly ONE flow chain. The demoted
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

const mod: QuestionModule = {
  definition,
  validate,
  fixtures,
  inputs: [],
  writes: [],
  // Attribution capture follows a supported script (spec 064 US1) — gated
  // scripts terminate before it. Until #1901 that was expressed by
  // il_target_script's conditional `next` default-branching here, and the
  // gate was DERIVED from that edge via gatedByFromNext. The attribution
  // questions now form their own post-track flow (#1901), where no
  // routing edge from il_target_script can reach; the gate's single home
  // is the session terminal instead — advance("identity") routes a gated
  // script to "unsupported", so this step is never reached for one.
  provides: ["author-name"],
  // #1901: BOTH of this question's order facts are cross-screen now —
  // the supported-script decision (settled by the identity screen) and
  // the track choice the attribution screen walks after (what the trio
  // proposes depends on it: profile confirmation on copy; the base's
  // copyright seeded on update). Declared as SCREEN-order requirements,
  // not module `requires` — the same treatment track_choice gives its
  // base-keyboard edge and project_display_name gives the track edge:
  // deriveScreens folds them into the full-list sort only, so this
  // flow's own per-flow sort (orderParity) never sees an edge it cannot
  // resolve in-flow. (In identity_lite, target-script was an in-flow
  // `requires`; the move is what reclassifies it.)
  screenRequires: ["target-script", "authoring-track"],
  // Spec 092 (T033): the stored author profile's name as a lookup default
  // (spec 064 FR-001: propose-then-confirm, never a blank form). Absent
  // when the profile has no name — ASK rather than substitute the login
  // handle, which is not a copyright holder.
  lookupDefault: (ctx) => {
    const name = ctx.identity?.authorProfile?.name;
    return name !== undefined && name !== null && name !== ""
      ? { value: name, source: "identity" }
      : undefined;
  },
};
export default mod;

// projectLabel — the ONE project-label precedence (spec 057 FR-041).
//
// Before this module the studio derived a project's human name in two places
// that disagreed:
//
//   - `draftPersistence.saveDraft` (the engine behind the "My keyboards"
//     cards) — scaffoldSpec -> identity patch -> base keyboard -> null.
//   - `draftAutosave.deriveLabel` (since-retired; read only by the resume
//     banner) — identityResult.english -> identityResult.autonym ->
//     scaffoldSpec -> base keyboard -> null.
//
// FR-041 states the FIRST order, and `draftPersistence` already implements it
// verbatim. Research D-8 originally concluded the opposite by examining
// `deriveLabel` instead; see the correction in research.md. Spec 047 settles
// it independently — it describes the label as derived from
// `workingCopy.identity` (the identity PATCH), not `survey.identityResult`.
//
// Adding a third derivation for the footer is precisely what FR-041 forbids,
// so the draft engine and the footer call this one function.

/** The four inputs the precedence reads, each optional. */
export interface ProjectLabelInput {
  /** Track 1's project_name step result. */
  readonly scaffoldSpec?: { readonly displayName?: string | null } | null;
  /**
   * The working-copy identity PATCH — `workingCopyStore.identity`, not
   * `surveySessionStore.identityResult`. The patch is what actually lands in
   * the emitted keyboard; the identity-lite result is an answer about the
   * language, not a name for the project.
   */
  readonly identity?: { readonly displayName?: string | null } | null;
  /** The base keyboard the working copy was instantiated from. */
  readonly baseKeyboard?: { readonly displayName?: string | null } | null;
}

/** A blank or whitespace-only name is not a name — fall through to the next tier. */
function usable(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Derive the project's display label.
 *
 * Precedence (FR-041, in this order):
 *   1. `scaffoldSpec.displayName` — the name the author typed at project_name
 *   2. `identity.displayName`     — the working-copy identity patch
 *   3. `baseKeyboard.displayName` — the keyboard being adapted
 *   4. `null`                     — nothing to name yet
 *
 * Returns `null` rather than a placeholder: the footer renders no project row
 * at all when there is no project (FR-040, US4 scenario 5), and a caller that
 * invents "Untitled" here would take that decision away from it.
 */
export function deriveProjectLabel(input: ProjectLabelInput): string | null {
  return (
    usable(input.scaffoldSpec?.displayName) ??
    usable(input.identity?.displayName) ??
    usable(input.baseKeyboard?.displayName)
  );
}

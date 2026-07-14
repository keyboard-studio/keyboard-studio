// draftPersistence — durable localStorage draft so an in-progress authoring
// session survives a hard reload / tab reopen / OAuth redirect return.
//
// This module is the reload-survival counterpart to persistWorkingCopy.ts
// (which snapshots to sessionStorage across an OAuth redirect only). The
// durable draft persists BOTH the working copy AND the traversal state (the
// "where am I in the walk" position), keyed per-project so a future
// multi-project index (US3a / FR-014) is additive rather than a migration.
//
// SCOPE (spec 034): this file currently carries only the FOUNDATIONAL key
// scheme (Phase 2, T004). The save/load/clear/autosave core + boot wiring is
// US3 (Phase 5, T017-T025) and is intentionally NOT implemented here yet — the
// keyed API surface is fixed now so the US3 build slots in without reshaping
// callers. See specs/034-mvp-authoring-walk/contracts/persistence.md.
//
// Article IV: when the autosave lands (Phase 5) its debounce MUST be a separate
// lightweight timer, never a second validation debounce or a parallel validate
// path.

// ---------------------------------------------------------------------------
// Key scheme (T004) — per-project, versioned localStorage keys.
// ---------------------------------------------------------------------------

/**
 * localStorage key namespace for durable drafts. The full key for a project is
 * `${DRAFT_KEY_PREFIX}${projectKey}.v${DRAFT_VERSION}` (see draftKey). The
 * per-project namespace (not one global key) is what lets a future draft index
 * (`ks.draftIndex.v1`) enumerate drafts without a data migration (FR-014).
 */
export const DRAFT_KEY_PREFIX = "ks.draft." as const;

/**
 * Current draft envelope version. On boot, a draft whose stored version does
 * not equal this is discarded, not migrated (VR-1) — an MVP-appropriate policy
 * that prevents a stale-shape draft from rehydrating into a changed store.
 */
export const DRAFT_VERSION = 1 as const;

/**
 * The namespaced, versioned localStorage key for a project's durable draft.
 *
 * @param projectKey  A stable per-project id (derived from the working copy's
 *                    keyboard id at instantiation). The MVP only ever reads/
 *                    writes one such key at a time.
 * @returns e.g. `ks.draft.my_kbd.v1`.
 */
export function draftKey(projectKey: string): string {
  return `${DRAFT_KEY_PREFIX}${projectKey}.v${DRAFT_VERSION}`;
}

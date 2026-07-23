// draftPersistence — durable localStorage draft so an in-progress authoring
// session survives a hard reload / tab reopen / OAuth redirect return.
//
// This module is the reload-survival counterpart to persistWorkingCopy.ts
// (which snapshots to sessionStorage across an OAuth redirect only). The
// durable draft persists BOTH the working copy AND the traversal state (the
// "where am I in the walk" position), keyed per-project so a future
// multi-project index (US3a / FR-014) is additive rather than a migration.
//
// See specs/034-mvp-authoring-walk/contracts/persistence.md (the UI contract)
// and specs/034-mvp-authoring-walk/data-model.md (the DurableDraft envelope).
//
// Article IV: installDraftAutosave's debounce is a SEPARATE lightweight timer,
// never the 300ms validator/WASM-oracle debounce cycle and never a second
// validation path — see the comment on installDraftAutosave below.

import {
  prepareWorkingCopySnapshot,
  snapshotWorkingCopyData,
} from "./persistWorkingCopy.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import type { WorkingCopyData } from "../stores/workingCopyStore.ts";
import {
  applyTraversalSnapshot,
  snapshotTraversal,
  useSurveySessionStore,
} from "../stores/surveySessionStore.ts";
import {
  applyPhaseBDraftSnapshot,
  snapshotPhaseBDraft,
  usePhaseBDraftStore,
} from "../stores/phaseBDraftStore.ts";
import { DEFAULT_PHASE_B_FONT, isPhaseBFontValue } from "../survey/surveyStyles.ts";
// Re-exported (not just imported) so existing external consumers of this
// module (draftPersistence.test.ts, StudioShell.tsx, etc.) keep importing
// `DurableDraft`/`ProjectIndexEntry`/`DraftMeta` from here unchanged, even
// though all three now LIVE in the dependency-free draftTypes.ts leaf — see
// that module's header for why `DurableDraft` moved out of this file (a
// depcruise-flagged type-only cycle through serverDraftStore.ts).
export type { DurableDraft, ProjectIndexEntry, DraftMeta } from "./draftTypes.ts";
import type { DurableDraft, ProjectIndexEntry, DraftMeta } from "./draftTypes.ts";
import {
  saveServerDraft,
  saveServerDraftBeacon,
  clearServerDraft,
  type ServerDraftMeta,
} from "./serverDraftStore.ts";

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

/**
 * localStorage key for the single "which project is active" pointer. Lets
 * boot resolve the one durable draft to load without a full index (G-3). The
 * multi-project index below (`DRAFT_INDEX_KEY`) is the "My keyboards" list
 * this pointer was always meant to be the one-project special case of.
 */
const ACTIVE_PROJECT_KEY = "ks.draft.active" as const;

/**
 * localStorage key for the multi-project index (US3a / FR-014 — "My
 * keyboards"). Stores a `ProjectIndexEntry[]`: a lightweight per-project row
 * (no working-copy payload) so the list can render without deserializing
 * every project's full `DurableDraft`. Kept up to date by `saveDraft` (upsert)
 * and `clearDraft` (remove) — every write to a per-project draft record has a
 * matching write to this index, so it can never drift out of sync with which
 * `ks.draft.<projectKey>.v1` records actually exist.
 */
export const DRAFT_INDEX_KEY = "ks.draftIndex.v1" as const;

/**
 * Reserved projectKey for a survey session with no instantiated working copy
 * yet. Ported from the dev reference implementation (draftAutosave.ts) for
 * interface parity, but NOT currently produced by any call site on main:
 * `saveDraft`'s VR-2 guard already refuses to persist before instantiation,
 * and `installDraftAutosave` is only ever installed with a real
 * `deriveProjectKeyFromWorkingCopy` result (see StudioShell's `doCommit`) —
 * so main never actually writes a draft keyed under this sentinel today.
 * Exported so a future pre-instantiation persistence build (or a caller
 * migrating a dev-shaped index) has a stable name to check against, and so
 * `MyKeyboardsList`'s ported display-label fallback (which treats this key as
 * "not a real name") continues to compile.
 */
export const PENDING_PROJECT_KEY = "__pending__" as const;

// ---------------------------------------------------------------------------
// DurableDraft envelope (data-model.md) — the type itself now lives in
// draftTypes.ts (imported/re-exported above); see that module's header for
// why. This module still owns all its read/write LOGIC (save/load/clear/
// index maintenance) below, unchanged.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// projectKey derivation
//
// "A stable per-project id derived from the working copy's keyboard id at
// instantiation" (data-model.md). `identity.keyboardId` is the authoritative
// source once set, but for Track 1 (instantiateFromBase) `identity` is reset
// to null immediately at instantiation and only gains `keyboardId` later (at
// the project_name step) — so `baseKeyboard.id` is the immediate fallback,
// available from the first instant of EITHER track's instantiation. Track 2
// (instantiateFromExisting) sets identity.keyboardId = keyboard.id right away,
// so both sources agree there.
// ---------------------------------------------------------------------------

/** Narrow slice of WorkingCopyData needed to derive the per-project key. */
export type ProjectKeySource = Pick<WorkingCopyData, "identity" | "baseKeyboard">;

/**
 * Derive the stable per-project key from working-copy state. Returns null
 * before any instantiation (both sources absent).
 */
export function deriveProjectKeyFromWorkingCopy(wc: ProjectKeySource): string | null {
  return wc.identity?.keyboardId ?? wc.baseKeyboard?.id ?? null;
}

// ---------------------------------------------------------------------------
// Active-project pointer
// ---------------------------------------------------------------------------

/**
 * Read the currently-active project key, or null if none is recorded (fresh
 * install, or cleared by start-over). Used at boot to resolve which draft to
 * load without an index (G-3).
 */
export function resolveActiveProjectKey(): string | null {
  try {
    return localStorage.getItem(ACTIVE_PROJECT_KEY);
  } catch {
    // Security/quota restriction reading localStorage — treat as "no active project".
    return null;
  }
}

/**
 * Record `projectKey` as the active project. Called at draft-write time
 * (saveDraft) and at autosave-install time (installDraftAutosave) so the
 * pointer exists even before the first debounced save completes.
 */
export function setActiveProjectKey(projectKey: string): void {
  try {
    localStorage.setItem(ACTIVE_PROJECT_KEY, projectKey);
  } catch {
    // VR-4-equivalent: quota/security failure — never throw into the authoring flow.
  }
}

/**
 * Unconditionally clear the active-project pointer (start-over, research D5).
 * Clearing regardless of the current value is intentional: after start-over
 * there should be no active project, full stop.
 */
export function clearActiveProjectKey(): void {
  try {
    localStorage.removeItem(ACTIVE_PROJECT_KEY);
  } catch {
    // VR-4: quota/security failure — never throw into the authoring flow.
  }
}

// ---------------------------------------------------------------------------
// Multi-project index ("My keyboards", US3a / FR-014) — storage primitives.
//
// Ported from the dev reference implementation's project-index scheme
// (draftAutosave.ts) onto main's `ks.draftIndex.v1` key. Every helper here is
// a plain localStorage read/write over `ProjectIndexEntry[]`; the actual
// upsert/remove call sites live in `saveDraft`/`clearDraft` below, so the
// index can never observably drift from the set of `ks.draft.<key>.v1`
// records that actually exist.
// ---------------------------------------------------------------------------

function readProjectIndex(): ProjectIndexEntry[] {
  try {
    const raw = localStorage.getItem(DRAFT_INDEX_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ProjectIndexEntry[]) : [];
  } catch {
    return [];
  }
}

function writeProjectIndex(entries: ProjectIndexEntry[]): void {
  try {
    localStorage.setItem(DRAFT_INDEX_KEY, JSON.stringify(entries));
  } catch {
    // VR-4: quota/security failure — never throw into the authoring flow.
  }
}

/** Insert or replace a project's index row (matched by projectKey). */
function upsertIndexEntry(entry: ProjectIndexEntry): void {
  const entries = readProjectIndex();
  const idx = entries.findIndex((e) => e.projectKey === entry.projectKey);
  if (idx === -1) entries.push(entry);
  else entries[idx] = entry;
  writeProjectIndex(entries);
}

function removeIndexEntry(projectKey: string): void {
  writeProjectIndex(readProjectIndex().filter((e) => e.projectKey !== projectKey));
}

/** Carry over an existing project's status/prUrl so autosave never downgrades a submitted project back to "draft". */
function existingStatusOverrides(
  projectKey: string,
): { status?: "draft" | "submitted"; prUrl?: string | null } | undefined {
  const existing = readProjectIndex().find((e) => e.projectKey === projectKey);
  return existing === undefined ? undefined : { status: existing.status, prUrl: existing.prUrl };
}

/**
 * Whether `projectKey`'s stored "My keyboards" index row is already
 * `status: "submitted"` — i.e. FROZEN against further autosave/cloud-sync
 * writes (a submitted project is not re-editable). Used by `saveDraft` and
 * `startCloudSync` to veto a write before it can overwrite the submitted
 * snapshot.
 */
function isProjectFrozen(projectKey: string): boolean {
  return readProjectIndex().some((e) => e.projectKey === projectKey && e.status === "submitted");
}

/** Build the ProjectIndexEntry mirror of a DurableDraft for a given project key. */
function buildIndexEntry(
  projectKey: string,
  draft: DurableDraft,
  overrides?: { status?: "draft" | "submitted"; prUrl?: string | null },
): ProjectIndexEntry {
  return {
    projectKey,
    savedAt: draft.savedAt,
    activeStepId: draft.traversal.activeStepId,
    label: draft.displayName,
    langTag: draft.languageTag,
    status: overrides?.status ?? "draft",
    prUrl: overrides?.prUrl ?? null,
  };
}

/**
 * Derive the server metadata row for one project. `projectKey` becomes the
 * server's `draftId` (and, when it's a real key rather than the reserved
 * pending slot, also `keyboardId` — display-only on the server).
 */
function buildServerMeta(
  draft: DurableDraft,
  projectKey: string,
  overrides?: { status?: "draft" | "submitted"; prUrl?: string | null },
): ServerDraftMeta {
  return {
    savedAt: draft.savedAt,
    activeStepId: draft.traversal.activeStepId,
    label: draft.displayName,
    keyboardId: projectKey === PENDING_PROJECT_KEY ? null : projectKey,
    schemaVersion: draft.version,
    draftId: projectKey,
    status: overrides?.status ?? "draft",
    prUrl: overrides?.prUrl ?? null,
  };
}

/**
 * The local "My keyboards" project list, newest-saved first. Public entry
 * point for `MyKeyboardsList` (ported from the dev reference implementation).
 */
export function listDrafts(): ProjectIndexEntry[] {
  return [...readProjectIndex()].sort((a, b) => b.savedAt - a.savedAt);
}

// ---------------------------------------------------------------------------
// save / load / clear (T018, T019, T020)
// ---------------------------------------------------------------------------

/**
 * Save the current working copy + traversal state as this project's durable
 * draft.
 *
 * Guard (VR-2): no-op when the working copy is not really instantiated
 * (`instantiationMode === null`) or has no working IR yet (`ir === null`) — a
 * guest who has not picked a keyboard has nothing worth persisting.
 *
 * FROZEN guard (US3a): a project already recorded as `status: "submitted"`
 * (see `recordProjectSubmission`) is read-only — this is a no-op, so an
 * author who keeps editing in the same tab after submitting can't silently
 * overwrite the submitted snapshot or re-pin the active pointer onto it.
 *
 * Wraps the localStorage write in try/catch (VR-4): a quota/security failure
 * is skipped silently so the authoring flow never throws; worst case a reload
 * loses the most recent edits, never a crash.
 */
export function saveDraft(projectKey: string): void {
  if (isProjectFrozen(projectKey)) return;

  const wc = useWorkingCopyStore.getState();
  if (wc.instantiationMode === null || wc.ir === null) {
    return; // VR-2
  }

  const session = useSurveySessionStore.getState();

  // displayName: Track-1 scaffoldSpec (project_name step) first, then the
  // identity patch's displayName (Track 2 / post-Phase-A Track 1), then the
  // base keyboard's own display name as a last resort.
  const displayName =
    session.scaffoldSpec?.displayName ??
    wc.identity?.displayName ??
    wc.baseKeyboard?.displayName ??
    null;

  // languageTag: identity-lite's computed BCP47 tag first (may be "" if the
  // step hasn't completed or the language subtag was left blank — normalize
  // that to null), then the identity patch's own bcp47 field.
  const rawLanguageTag = session.identityResult?.bcp47 ?? wc.identity?.bcp47 ?? null;
  const languageTag = rawLanguageTag !== null && rawLanguageTag !== "" ? rawLanguageTag : null;

  const envelope: DurableDraft = {
    version: DRAFT_VERSION,
    savedAt: Date.now(),
    projectKey,
    displayName,
    languageTag,
    workingCopy: snapshotWorkingCopyData(),
    traversal: snapshotTraversal(),
    phaseBDraft: snapshotPhaseBDraft(),
  };

  try {
    localStorage.setItem(draftKey(projectKey), JSON.stringify(envelope));
    setActiveProjectKey(projectKey);
    // Keep the "My keyboards" index in lockstep with every successful write —
    // see the module note above the index primitives.
    upsertIndexEntry(buildIndexEntry(projectKey, envelope, existingStatusOverrides(projectKey)));
  } catch {
    // VR-4: quota/security failure — skip silently, author keeps working.
  }
}

/**
 * Whether `loadDraft()` successfully restored a draft THIS page boot.
 *
 * `main.tsx` calls `loadDraft()` exactly once, before React mounts, so this
 * flag is set (if at all) before any component ever renders — including
 * before StrictMode's double-invoked mount effects, which therefore both see
 * the same stable value (deviation 2, research D4).
 */
let _draftRestoredThisBoot = false;

/** Reader for the module-level "restored this boot" flag — see above. */
export function wasDraftRestoredThisBoot(): boolean {
  return _draftRestoredThisBoot;
}

/**
 * Discard an unusable draft record found during load (version-mismatched or
 * corrupt) AND clear the active-project pointer when it names this key.
 *
 * `loadDraft` is always called with the key `main.tsx` resolved from the active
 * pointer, so discarding just the record (bare `clearDraft`) would leave
 * `ks.draft.active` dangling at a now-deleted record — every subsequent boot
 * would resolve to a key with no record until the next instantiation happened
 * to repoint it. Clearing the pointer here (only when it matches, so a future
 * caller passing a non-active key can't wipe the real active project) keeps a
 * bad draft from lingering as a dead pointer. VR-2 ("no real work") does NOT
 * route through here — that record is intentionally left in place.
 */
function discardCorruptDraft(projectKey: string): void {
  clearDraft(projectKey);
  if (resolveActiveProjectKey() === projectKey) {
    clearActiveProjectKey();
  }
}

/**
 * Load `projectKey`'s durable draft (if any) and rehydrate both stores.
 *
 * - Returns false if no draft is stored under this key.
 * - VR-3: a malformed/unparseable draft is removed and treated as absent.
 * - VR-1: a version mismatch is removed and treated as absent (discard, not
 *   migrate).
 * - VR-2: a draft with no real instantiation is treated as absent (left in
 *   place — not removed; nothing to migrate away from).
 * - G-1/G-5: on success, patches the SAME single working-copy store and the
 *   SAME single survey-session store — never constructs a second working
 *   copy — then returns true so the caller can resume at
 *   `traversal.activeStepId`.
 */
export function loadDraft(projectKey: string): boolean {
  let raw: string | null;
  try {
    raw = localStorage.getItem(draftKey(projectKey));
  } catch {
    return false;
  }
  if (raw === null) return false;

  // VR-3 (P0 fix): the ENTIRE parse-through-apply body is one try/catch, not
  // just the JSON.parse call. A record can be valid JSON but wrong-shaped
  // (e.g. `{"version":1}` with `workingCopy` missing/null, or a non-object
  // value), or `applyWorkingCopySnapshot` can throw deep inside
  // `deserializeEntry`'s `atob()` on a corrupt Base64 VFS entry. Any of these
  // must be treated exactly like an unparseable draft — clear + treat as
  // absent — never thrown into `main.tsx`'s pre-mount, unguarded call.
  try {
    const envelope = JSON.parse(raw) as DurableDraft;

    if (envelope.version !== DRAFT_VERSION) {
      // VR-1: version mismatch — discard, do not attempt to migrate.
      discardCorruptDraft(projectKey);
      return false;
    }

    if (
      envelope.workingCopy === null ||
      typeof envelope.workingCopy !== "object" ||
      envelope.workingCopy.instantiationMode === null
    ) {
      // VR-2: "no real work" (or the field is missing/wrong-shaped) — ignored
      // (not removed; mirrors the sessionStorage snapshot guard's semantics
      // of "nothing worth restoring").
      return false;
    }

    // VR-3 (traversal shape): a version-matched record with a valid working
    // copy but a missing/malformed `traversal` is genuinely corrupt — but
    // `applyTraversalSnapshot`'s object-spread never THROWS on a non-object
    // (`{...null}`/`{...undefined}` = `{}`), so without this guard it would
    // slip past the catch below, restore the working copy, and leave the walk
    // position silently defaulted to the initial "identity" step — an
    // inconsistent resume. Validate the traversal shape symmetrically with the
    // workingCopy guard above and, since it can't self-heal, remove + treat as
    // absent (VR-3), rather than resume broken. Placed BEFORE the first
    // `applyWorkingCopySnapshot` so a bad record never partially patches the
    // stores.
    if (envelope.traversal === null || typeof envelope.traversal !== "object") {
      discardCorruptDraft(projectKey);
      return false;
    }

    // Atomic multi-store restore: do ALL fallible work FIRST —
    // `prepareWorkingCopySnapshot` is the only step that can throw (e.g.
    // `atob()` on a corrupt Base64 VFS entry) — before mutating either store.
    // The two commits below are pure (`setState` / object-spread) and cannot
    // throw, so a failure can never leave the working-copy store patched while
    // the survey-session store is not (or the boot flag half-set).
    const workingCopyState = prepareWorkingCopySnapshot(envelope.workingCopy);
    useWorkingCopyStore.setState(workingCopyState);
    applyTraversalSnapshot(envelope.traversal);

    // phaseBDraft (P0 fix): optional/additive field — a pre-this-change record
    // has none, and a malformed one (non-array `chars`) is tolerated rather
    // than discarding an otherwise-good record, since it's not load-bearing
    // for working-copy/traversal correctness the way `traversal`'s shape is.
    // Either case restores to an empty alphabet, same as today's behaviour.
    // `selectedFont` (font-selection dropdown addition) is validated the same
    // tolerant way — a pre-this-change record has no such field, and an
    // unrecognized value falls back to the default rather than discarding the
    // record.
    const restoredChars = Array.isArray(envelope.phaseBDraft?.chars)
      ? envelope.phaseBDraft.chars
      : [];
    const restoredFont = isPhaseBFontValue(envelope.phaseBDraft?.selectedFont)
      ? envelope.phaseBDraft.selectedFont
      : DEFAULT_PHASE_B_FONT;
    applyPhaseBDraftSnapshot({ chars: restoredChars, selectedFont: restoredFont });

    _draftRestoredThisBoot = true;
    return true;
  } catch {
    // VR-3: malformed/wrong-shaped/corrupt (or a throw from
    // prepareWorkingCopySnapshot BEFORE any store was touched) — remove and
    // treat as absent so it doesn't loop or crash boot.
    discardCorruptDraft(projectKey);
    return false;
  }
}

/**
 * Remove `projectKey`'s durable draft AND its "My keyboards" index row. Does
 * NOT touch the active-project pointer — callers that also want the pointer
 * cleared (start-over) call `clearActiveProjectKey()` alongside this (see
 * StudioShell.handleStartOver and WelcomeScreen's "I'm new" entry point), so
 * the two concerns stay independently callable per the persistence contract.
 *
 * Removing the index row here (not just the record) keeps every discard path
 * — start-over, an explicit "My keyboards" delete, and the VR-1/VR-3
 * corrupt-draft discard in `discardCorruptDraft` — from leaving a "My
 * keyboards" card pointing at a record that no longer exists.
 */
export function clearDraft(projectKey: string): void {
  try {
    localStorage.removeItem(draftKey(projectKey));
  } catch {
    // VR-4: quota/security failure — never throw into the authoring flow.
  }
  removeIndexEntry(projectKey);
}

/**
 * VR-5 single-project MVP guard (FR-009 / US3 AS-4): instantiating a working
 * copy under a DIFFERENT projectKey than the currently-active one must be
 * well-defined — replace, never silently merge two projects' state into one
 * record.
 *
 * For the MVP this is a clean REPLACE (no confirmation prompt): the prior
 * project's draft is cleared outright. Call this BEFORE the new
 * instantiation's own autosave starts writing under `newProjectKey` (see
 * StudioShell's onInstantiate). The active pointer is left untouched here —
 * the new project's own saveDraft/installDraftAutosave call repoints it to
 * `newProjectKey` immediately after.
 */
export function replaceActiveDraftIfDifferentProject(newProjectKey: string): void {
  const prevKey = resolveActiveProjectKey();
  if (prevKey !== null && prevKey !== newProjectKey) {
    clearDraft(prevKey);
  }
}

/**
 * Discard the currently-active project's persisted draft entirely: clears
 * the project-scoped draft record (if the active pointer resolves to one)
 * and unconditionally clears the active-project pointer itself.
 *
 * Extracted (P2 synthesis) from two identical inline call sites —
 * WelcomeScreen's "I'm new" entry point and StudioShell's
 * `handleStartOver` — so the "resolve active projectKey -> clearDraft ->
 * clearActiveProjectKey" sequence is written once. Resolves the target via
 * `resolveActiveProjectKey()` rather than requiring the caller to derive it,
 * so every caller discards the SAME draft the active pointer names.
 */
export function discardActiveDraft(): void {
  const projectKey = resolveActiveProjectKey();
  if (projectKey !== null) {
    clearDraft(projectKey);
  }
  clearActiveProjectKey();
}

// ---------------------------------------------------------------------------
// installDraftAutosave (T021)
// ---------------------------------------------------------------------------

/**
 * Debounce window for the autosave write — see the Article IV note below. This
 * is deliberately distinct from the validator's 300ms `DEBOUNCE_MS` (Decision
 * D3): the autosave is a SEPARATE, lightweight timer, never a second validate
 * cycle. Exported so a regression test can pin the two windows apart.
 */
export const AUTOSAVE_DEBOUNCE_MS = 500;

/**
 * Subscribe to the working-copy store, the survey-session store, AND the
 * phase-B draft store (P0 fix — the build-list alphabet must autosave the
 * same way the other two traversal-relevant stores already do); on any
 * change, debounce ~500ms then write this project's durable draft.
 *
 * Article IV (critical): this debounce timer is an INDEPENDENT, lightweight
 * `setTimeout` — it is NOT the 300ms validator/WASM-oracle debounce cycle
 * (owned by useValidator/km-validator's single-cycle contract) and it starts
 * no second validation path. It only decides when to persist the three stores'
 * already-computed state to localStorage. Do not fold this into the validator
 * debounce, and do not add a THIRD (or fourth) debounce timer alongside it for
 * some other concern without going through km-validator first — the phase-B
 * draft store's changes route through this SAME existing debounce/subscribe
 * mechanism rather than introducing a new one.
 *
 * Returns a teardown function that unsubscribes all three stores and clears
 * any pending timer. Call it on app unmount (and before installing a new
 * autosave for a different project).
 *
 * P1 fix (G-1 gap): performs ONE synchronous `saveDraft(projectKey)` here, at
 * install time — not just the active-pointer write — so a draft RECORD exists
 * immediately at instantiation, before the first debounced store mutation.
 * Without this, a reload in the window between "instantiation succeeded" and
 * "the author's first edit" found only the active pointer and no draft
 * record, so `loadDraft` returned false and the just-instantiated project was
 * silently discarded on reload. `saveDraft`'s own VR-2 guard still applies
 * (no-ops if the working copy is somehow not yet instantiated), so this is
 * safe to call unconditionally.
 */
export function installDraftAutosave(projectKey: string): () => void {
  // Record the active project immediately — a reload before the first
  // debounced save still resolves the correct draft on next boot.
  setActiveProjectKey(projectKey);

  // Synchronous initial save (P1 fix) — see the doc comment above.
  saveDraft(projectKey);

  let timer: ReturnType<typeof setTimeout> | null = null;

  const scheduleSave = () => {
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      saveDraft(projectKey);
    }, AUTOSAVE_DEBOUNCE_MS);
  };

  const unsubscribeWorkingCopy = useWorkingCopyStore.subscribe(scheduleSave);
  const unsubscribeSurveySession = useSurveySessionStore.subscribe(scheduleSave);
  const unsubscribePhaseBDraft = usePhaseBDraftStore.subscribe(scheduleSave);

  return () => {
    unsubscribeWorkingCopy();
    unsubscribeSurveySession();
    unsubscribePhaseBDraft();
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

// ---------------------------------------------------------------------------
// flushActiveDraft — synchronous pre-redirect save
// ---------------------------------------------------------------------------

/**
 * Synchronously persist the active project's draft right now, bypassing the
 * ~500ms autosave debounce.
 *
 * Called before an OAuth redirect (see useGitHubAuth / useGoogleAuth) so the
 * durable draft is never STALER than the synchronous pre-redirect
 * sessionStorage snapshot (`snapshotWorkingCopyToSession`). Without this, a
 * sign-in within 500ms of a step advance would leave the durable draft holding
 * the pre-advance working copy AND traversal while the OAuth snapshot holds the
 * post-advance working copy; on return, loadDraft restores the stale traversal
 * and the working-copy-only sessionStorage rehydrate then layers the fresher
 * working copy on top — leaving `activeStepId` lagging the working copy by a
 * step. Flushing here captures both stores at the same instant the OAuth
 * snapshot is taken, so the two agree.
 *
 * No-op when there is no active project; `saveDraft`'s own VR-2 guard also
 * applies (nothing written if the working copy is not instantiated).
 */
export function flushActiveDraft(): void {
  const projectKey = resolveActiveProjectKey();
  if (projectKey !== null) {
    saveDraft(projectKey);
  }
}

// ---------------------------------------------------------------------------
// "My keyboards" (US3a / FR-014) — resume / delete / submit by project.
//
// `listDrafts()` (the list read) lives up near the index primitives, next to
// the helpers it shares with `saveDraft`. The three functions below are the
// project-scoped write actions `MyKeyboardsList` and `ManagedPRSubmitPanel`
// call, ported from the dev reference implementation (draftAutosave.ts)
// onto main's engine.
// ---------------------------------------------------------------------------

/**
 * Resume a SPECIFIC project (not necessarily the currently-active one): load
 * its `DurableDraft` into both stores via `loadDraft`, and — only on a
 * successful apply — pin it as the active project.
 *
 * Reuses `loadDraft` rather than re-implementing the parse/validate/apply
 * sequence: on main, unlike the dev reference implementation, there is no
 * resume-banner component deciding whether to apply a draft — SurveyView's
 * mount effect reads `wasDraftRestoredThisBoot()` to decide whether to reset
 * the session store, and `loadDraft` already sets that flag on success. So
 * a `MyKeyboardsList` "Resume" click that calls this, then navigates to
 * `#survey`, resumes into the SAME already-applied stores rather than racing
 * a fresh reset — see `MyKeyboardsList.tsx`'s handleResume for the other half
 * of this.
 *
 * A corrupt/wrong-shaped draft fails the whole resume (returns false,
 * pointer left untouched) rather than silently pinning a project whose
 * working copy never actually loaded.
 */
export function resumeProject(projectKey: string): boolean {
  const applied = loadDraft(projectKey);
  if (applied) {
    setActiveProjectKey(projectKey);
  }
  return applied;
}

/**
 * Delete a SPECIFIC project: its local draft record + "My keyboards" index
 * row (via `clearDraft`), the active-project pointer (if it was pointing at
 * this project), and — for a signed-in caller — the server-side row via
 * `DELETE /drafts?draftId=<key>`. The server call is fire-and-soft-fail
 * (`clearServerDraft` already swallows every transport error): a guest or an
 * offline signed-in caller still gets the local removal.
 */
export async function deleteProject(projectKey: string, token: string | null): Promise<void> {
  clearDraft(projectKey);
  if (resolveActiveProjectKey() === projectKey) {
    clearActiveProjectKey();
  }
  if (token !== null && token !== "") {
    await clearServerDraft(token, projectKey);
  }
}

/**
 * Transition the ACTIVE project to `status: "submitted"` with the given PR
 * URL — called on a successful managed-PR submit (see
 * `ManagedPRSubmitPanel.tsx`) INSTEAD of discarding the draft. The project's
 * index row is updated in place and, for a signed-in caller, PUT to the
 * server with the same status/prUrl; the existing draft payload is sent
 * unchanged so the project keeps its full working-copy record — this is not
 * a deletion. The active-project pointer is cleared afterward — the survey
 * session that just submitted is over — but the project's own storage/index
 * row is NOT removed, so it keeps appearing in "My keyboards" as a Submitted
 * card. From this point on, `saveDraft`'s frozen-project guard refuses any
 * further write to this projectKey.
 *
 * No-op (but still clears the pointer) when the active project's draft
 * record is missing or unparseable — there is nothing to transition.
 */
export async function recordProjectSubmission(prUrl: string, token: string | null): Promise<void> {
  const projectKey = resolveActiveProjectKey();
  if (projectKey === null) return;

  let raw: string | null;
  try {
    raw = localStorage.getItem(draftKey(projectKey));
  } catch {
    raw = null;
  }
  if (raw === null) {
    clearActiveProjectKey();
    return;
  }

  let envelope: DurableDraft;
  try {
    envelope = JSON.parse(raw) as DurableDraft;
  } catch {
    clearActiveProjectKey();
    return;
  }

  const overrides = { status: "submitted" as const, prUrl };
  upsertIndexEntry(buildIndexEntry(projectKey, envelope, overrides));

  if (token !== null && token !== "") {
    const meta = buildServerMeta(envelope, projectKey, overrides);
    void saveServerDraft(token, meta, envelope, projectKey);
  }

  clearActiveProjectKey();
}

/**
 * Peek at the ACTIVE project's stored draft WITHOUT applying it — a
 * lightweight summary for a future resume affordance. Returns null when
 * there is no active project, or its record is missing/wrong-shaped. Unlike
 * `loadDraft`, never mutates storage or the stores — a pure read.
 */
export function loadDraftMeta(): DraftMeta | null {
  const projectKey = resolveActiveProjectKey();
  if (projectKey === null) return null;

  let raw: string | null;
  try {
    raw = localStorage.getItem(draftKey(projectKey));
  } catch {
    return null;
  }
  if (raw === null) return null;

  try {
    const envelope = JSON.parse(raw) as DurableDraft;
    if (
      envelope.version !== DRAFT_VERSION ||
      envelope.workingCopy === null ||
      typeof envelope.workingCopy !== "object"
    ) {
      return null;
    }
    return {
      savedAt: envelope.savedAt,
      activeStepId: envelope.traversal.activeStepId,
      label: envelope.displayName,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// startCloudSync — signed-in cloud-draft backup (US3a).
//
// Mirrors the in-progress ACTIVE project's draft to the server for a
// signed-in author, alongside (never instead of) `installDraftAutosave`'s
// localStorage write — localStorage stays the instant local-first cache; this
// adds a durable server-side backup so the draft survives a cleared browser,
// a new tab, or a different device.
//
// SIMPLIFICATION vs the dev reference implementation's `startCloudSync`: dev
// tracks its own `buildStudioDraft()` snapshot; this port instead re-reads
// whatever `saveDraft` most recently wrote to `ks.draft.<projectKey>.v1`, so
// there is exactly one place (`saveDraft`) that knows how to build a
// `DurableDraft` from the live stores. The tradeoff: a cloud push can only
// ever be as fresh as the last local autosave (≤ AUTOSAVE_DEBOUNCE_MS old),
// never fresher — acceptable for a "durable backup", not a live sync target.
//
// Article IV / decision D3 scope note: this is a SECOND lightweight timer
// alongside `installDraftAutosave`'s ~500ms one, exactly as
// `AUTOSAVE_DEBOUNCE_MS` already is relative to the validator's 300ms cycle —
// neither touches the validation path or produces preview feedback, so
// neither is "a second debounce cycle" in the D3 sense. This timer is
// deliberately coarser (20s) than the local autosave: the server push only
// needs to be eventually-consistent, so requests are batched aggressively.
// Two checkpoints — the tab becoming hidden and page unload (keepalive
// fetch) — flush sooner so a close/navigation doesn't lose a full window.
//
// `getToken` returns the current GitHub access token or null — read lazily on
// each flush so signing in mid-session begins syncing without restarting the
// subscription, and signing out stops it (a guest, token null, never pushes).
// A content hash suppresses redundant pushes when nothing changed since the
// last one; an oversized draft is kept local-only (the sibling autosave still
// has it) since the server would reject it anyway.
//
// Returns an unsubscribe that removes the listeners and cancels any pending
// timer. Call it on sign-out and on unmount, alongside the local autosave's
// own teardown (see StudioShell.tsx).
// ---------------------------------------------------------------------------

// Exported (same rationale as AUTOSAVE_DEBOUNCE_MS) so a regression test can
// pin the cloud-sync window without duplicating the literal.
export const CLOUD_SYNC_DEBOUNCE_MS = 20_000;

/**
 * Client-side ceiling on a cloud-synced draft (bytes), mirroring the
 * server's own limit. A draft above this is kept in localStorage but NOT
 * pushed — the server would reject it anyway. No console log on this path
 * (matches this module's convention — see saveDraft's VR-4 comment): the
 * local autosave already has the draft, so this is a benign skip, not an
 * error worth surfacing.
 */
export const MAX_CLOUD_DRAFT_BYTES = 4 * 1024 * 1024;

/**
 * Small, fast, non-cryptographic string hash (djb2). Used only to detect "did
 * the stored draft change since the last successful push?" so redundant cloud
 * writes are skipped — never for integrity or security.
 */
function simpleHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return (h >>> 0).toString(36); // >>> 0 -> unsigned; base36 keeps it short.
}

export function startCloudSync(getToken: () => string | null): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastPushedHash: string | null = null;
  let disposed = false;

  const flush = (viaBeacon: boolean): void => {
    const token = getToken();
    if (token === null || token === "") return;

    const projectKey = resolveActiveProjectKey();
    if (projectKey === null || isProjectFrozen(projectKey)) return;

    let raw: string | null;
    try {
      raw = localStorage.getItem(draftKey(projectKey));
    } catch {
      return;
    }
    if (raw === null) return;

    if (new TextEncoder().encode(raw).length > MAX_CLOUD_DRAFT_BYTES) {
      // Kept in localStorage by the sibling autosave; skip the server push
      // silently — this module never logs to console (see saveDraft's VR-4
      // and every other quota/security-failure branch above), so a bare
      // console.warn here would be the one call site that doesn't match.
      return;
    }

    const hash = simpleHash(raw);
    if (hash === lastPushedHash) return; // nothing changed since the last push

    let envelope: DurableDraft;
    try {
      envelope = JSON.parse(raw) as DurableDraft;
    } catch {
      return; // Malformed local record — `loadDraft`/`discardCorruptDraft` handle cleanup elsewhere.
    }

    const meta = buildServerMeta(envelope, projectKey, existingStatusOverrides(projectKey));
    if (viaBeacon) {
      // Unload path: fire-and-forget; assume it lands so we don't re-push.
      saveServerDraftBeacon(token, meta, envelope, projectKey);
      lastPushedHash = hash;
    } else {
      void saveServerDraft(token, meta, envelope, projectKey).then((ok) => {
        if (ok) lastPushedHash = hash;
      });
    }
  };

  const schedule = (): void => {
    if (disposed) return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      flush(false);
    }, CLOUD_SYNC_DEBOUNCE_MS);
  };

  const onVisibilityChange = (): void => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      flush(false);
    }
  };
  const onBeforeUnload = (): void => flush(true);

  const unsubscribeWorkingCopy = useWorkingCopyStore.subscribe(schedule);
  const unsubscribeSurveySession = useSurveySessionStore.subscribe(schedule);
  const unsubscribePhaseBDraft = usePhaseBDraftStore.subscribe(schedule);
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityChange);
  }
  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", onBeforeUnload);
  }

  // Immediate flush at install time (mirrors installDraftAutosave's P1 fix):
  // a signed-in author who already has a local draft gets its first cloud
  // push right away rather than waiting a full CLOUD_SYNC_DEBOUNCE_MS.
  flush(false);

  return () => {
    disposed = true;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    unsubscribeWorkingCopy();
    unsubscribeSurveySession();
    unsubscribePhaseBDraft();
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("beforeunload", onBeforeUnload);
    }
  };
}

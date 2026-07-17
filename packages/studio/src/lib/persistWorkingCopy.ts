// persistWorkingCopy — snapshot/rehydrate the working copy across OAuth redirects.
//
// OAuth connect() calls (GitHub + Google) do a full-page redirect, wiping the
// in-memory Zustand store. This module snapshots all serializable data fields
// to sessionStorage before the redirect, then rehydrates (and clears) on
// re-entry, restoring the author's in-progress working copy.
//
// Idiom mirrors the existing PKCE scratch: setOAuthScratch/clearOAuthScratch
// in githubOAuth.ts — write a namespaced sessionStorage key before the redirect;
// consume-and-clear on callback return.
//
// Serialization contracts:
//   - VirtualFS binary entries (isBinary=true): Uint8Array → Base64 for JSON.
//     Raw JSON.stringify of a Uint8Array produces a corrupt sparse object.
//   - Set<string> fields: spread to [] for storage, new Set(arr) on rehydrate.
//   - KeyboardIR (baseIr, ir): plain objects, safe for direct JSON round-trip.
//
// Derived-field policy — fields NOT stored; RE-DERIVED on rehydration:
//   - removalCapabilities: Map<string, RemovalCapability> — re-derived from the
//     restored `baseIr` via classifyRemovalCapabilities(baseIr) in
//     rehydrateWorkingCopyFromSession. Source: baseIr (NOT the carve working
//     `ir`) — this mirrors the store invariant that the capability map is
//     computed once at instantiation from the base IR and never recomputed on
//     carve edits. If baseIr is null, stays empty Map.
//   - session: SurveySession — re-derived from the restored `irAxes` +
//     `phaseResults` via mergePhaseResults(irAxes, phaseResults).
//     Source: irAxes + phaseResults.
//   Never snapshot these fields — recompute them so they can't drift from their inputs.
//
//   - Action functions from the Zustand factory: excluded automatically (not in
//     the data fields enumerated here).
//
// Reuse (spec 034 US3): `WorkingCopySnapshot`, `serializeEntry`/`deserializeEntry`,
// and the `snapshotWorkingCopyData`/`applyWorkingCopySnapshot` builder/applier are
// exported so the durable localStorage draft (../lib/draftPersistence.ts) builds
// and restores its `workingCopy` envelope field through this exact code — never
// a second enumeration of the WorkingCopyData field list.

import type { RemovalCapability, VirtualFS, VirtualFSEntry } from "@keyboard-studio/contracts";
import { createVirtualFS, mergePhaseResults } from "@keyboard-studio/contracts";
import { classifyRemovalCapabilities } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import type { WorkingCopyData } from "../stores/workingCopyStore.ts";

// ---------------------------------------------------------------------------
// Key
// ---------------------------------------------------------------------------

/** sessionStorage key for the working-copy draft snapshot. */
const DRAFT_KEY = "ks.working-copy.draft";

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

/** Serializable form of a VirtualFSEntry (binary content as Base64 string). */
export interface SerializedEntry {
  path: string;
  content: string; // Base64 if isBinary, verbatim string otherwise
  isBinary: boolean;
}

/**
 * Full serializable snapshot of working-copy data fields.
 *
 * Derived from the store's `WorkingCopyData` so completeness is compiler-enforced:
 * when a new data field lands on the store, it appears here automatically and the
 * snapshot/rehydrate object literals fail to compile until they account for it —
 * no silent omission that would rehydrate at a default after a redirect.
 *
 * The base type is narrowed by serialization overrides:
 *   - `baseVfs` (a VirtualFS instance) → `baseVfsEntries` (Base64-encoded plain array)
 *   - `deletedNodeIds` / `deletedItemIds` / `staleSteps` (Set<string>) → `string[]`
 * and two derived fields are dropped entirely (`removalCapabilities`, `session`)
 * because they are re-derived on rehydration, never stored.
 *
 * `validatorFindings` (LintFinding[]) and `axisFills` (AxisFill[], #890) flow
 * through unchanged — both are plain, JSON-safe data, so they round-trip
 * directly with no override.
 *
 * Exported (spec 034 US3): the durable localStorage draft
 * (`../lib/draftPersistence.ts`) reuses this exact type — and the
 * `snapshotWorkingCopyData`/`applyWorkingCopySnapshot` builder/applier below —
 * for its `workingCopy` envelope field, rather than re-enumerating the field
 * list a second time.
 */
export type WorkingCopySnapshot = Omit<
  WorkingCopyData,
  | "baseVfs"
  | "deletedNodeIds"
  | "deletedItemIds"
  | "staleSteps"
  | "removalCapabilities"
  | "session"
> & {
  baseVfsEntries: SerializedEntry[];
  deletedNodeIds: string[];
  deletedItemIds: string[];
  staleSteps: string[];
};

export function serializeEntry(entry: VirtualFSEntry): SerializedEntry {
  if (entry.isBinary) {
    // Uint8Array → Base64
    const bytes = entry.content as Uint8Array;
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    return { path: entry.path, content: btoa(binary), isBinary: true };
  }
  return { path: entry.path, content: entry.content as string, isBinary: false };
}

export function deserializeEntry(raw: SerializedEntry): VirtualFSEntry {
  if (raw.isBinary) {
    const binary = atob(raw.content);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return { path: raw.path, content: bytes, isBinary: true };
  }
  return { path: raw.path, content: raw.content, isBinary: false };
}

// ---------------------------------------------------------------------------
// Shared snapshot builder / applier (spec 034 US3)
//
// Extracted so BOTH the OAuth-redirect sessionStorage snapshot below AND the
// durable localStorage draft (../lib/draftPersistence.ts) build/apply the
// working-copy portion of their envelope through the exact same code — no
// second enumeration of the WorkingCopyData field list.
// ---------------------------------------------------------------------------

// Base-VFS serialization cache (efficiency): the base VFS is set once at
// instantiation (workingCopyStore.instantiateFromBase/FromExisting) and never
// mutated in place, so its Base64 serialization is invariant for the life of a
// working copy. The durable-draft autosave calls snapshotWorkingCopyData on
// every ~500ms debounced change during authoring, and re-encoding the whole
// (potentially hundreds of KB) base file tree each time is pure wasted work.
// Memoize on the baseVfs OBJECT REFERENCE: a cache hit while the same working
// copy is active, an automatic recompute when a new instantiation replaces the
// reference (or a reset sets it back to null).
let _cachedBaseVfsRef: VirtualFS | null = null;
let _cachedBaseVfsEntries: SerializedEntry[] = [];

function serializeBaseVfsEntries(baseVfs: VirtualFS | null): SerializedEntry[] {
  if (baseVfs === null) return [];
  if (baseVfs !== _cachedBaseVfsRef) {
    _cachedBaseVfsRef = baseVfs;
    _cachedBaseVfsEntries = baseVfs.entries().map(serializeEntry);
  }
  return _cachedBaseVfsEntries;
}

/**
 * Build a serializable snapshot of the CURRENT working-copy store state.
 *
 * Does NOT guard on instantiationMode/ir — callers that only want to persist
 * a real working copy (both callers in this module, and
 * draftPersistence.saveDraft's VR-2 guard) check that themselves before
 * calling, since each caller's guard condition is otherwise identical and the
 * check is cheap to repeat at the call site rather than hide in here.
 *
 * The base-VFS serialization is memoized on the baseVfs reference (see
 * `serializeBaseVfsEntries`) so the debounced autosave does not re-Base64 the
 * immutable base file tree on every write.
 */
export function snapshotWorkingCopyData(): WorkingCopySnapshot {
  const s = useWorkingCopyStore.getState();
  return {
    instantiationMode: s.instantiationMode,
    baseKeyboard: s.baseKeyboard,
    baseVfsEntries: serializeBaseVfsEntries(s.baseVfs),
    baseIr: s.baseIr,
    identity: s.identity,
    ir: s.ir,
    deletedNodeIds: [...s.deletedNodeIds],
    deletedItemIds: [...s.deletedItemIds],
    undoStack: s.undoStack,
    phaseResults: s.phaseResults,
    irAxes: s.irAxes,
    desktopLocked: s.desktopLocked,
    sequenceFlaggedChars: s.sequenceFlaggedChars,
    touchLayoutJson: s.touchLayoutJson,
    touchDraft: s.touchDraft,
    galleryIntrosSeen: s.galleryIntrosSeen,
    staleSteps: [...s.staleSteps],
    validatorFindings: s.validatorFindings,
    axisFills: s.axisFills,
  };
}

/**
 * Build the working-copy store patch from a snapshot WITHOUT mutating the
 * store. This is where all the FALLIBLE work lives — `deserializeEntry`'s
 * `atob()` can throw on a corrupt Base64 VFS entry, and the re-derivation of
 * the dropped fields runs here too (`removalCapabilities` from `baseIr`,
 * `session` from `irAxes` + `phaseResults`; see the derived-field policy in the
 * module header). Separated from the commit so a caller restoring MORE than one
 * store (draftPersistence.loadDraft restores the working-copy AND survey-session
 * stores) can do every throwing step BEFORE mutating anything — a throw then
 * leaves both stores untouched rather than one patched and the other not.
 */
export function prepareWorkingCopySnapshot(snapshot: WorkingCopySnapshot): Partial<WorkingCopyData> {
  const baseVfs = createVirtualFS(snapshot.baseVfsEntries.map(deserializeEntry));

  const removalCapabilities =
    snapshot.baseIr !== null
      ? classifyRemovalCapabilities(snapshot.baseIr)
      : new Map<string, RemovalCapability>();

  const session = mergePhaseResults(snapshot.irAxes, snapshot.phaseResults);

  return {
    instantiationMode: snapshot.instantiationMode,
    baseKeyboard: snapshot.baseKeyboard,
    baseVfs,
    baseIr: snapshot.baseIr,
    identity: snapshot.identity,
    ir: snapshot.ir,
    removalCapabilities,
    deletedNodeIds: new Set(snapshot.deletedNodeIds),
    deletedItemIds: new Set(snapshot.deletedItemIds),
    undoStack: snapshot.undoStack,
    phaseResults: snapshot.phaseResults,
    irAxes: snapshot.irAxes,
    session,
    desktopLocked: snapshot.desktopLocked,
    sequenceFlaggedChars: snapshot.sequenceFlaggedChars,
    touchLayoutJson: snapshot.touchLayoutJson,
    touchDraft: snapshot.touchDraft,
    galleryIntrosSeen: snapshot.galleryIntrosSeen,
    staleSteps: new Set(snapshot.staleSteps),
    validatorFindings: snapshot.validatorFindings,
    axisFills: snapshot.axisFills,
  };
}

/**
 * Patch a `WorkingCopySnapshot` directly into the ONE working-copy store
 * (Article III — restore never constructs a second working copy). Composes
 * `prepareWorkingCopySnapshot` (fallible) with a single `setState` (pure), so a
 * throw during preparation never mutates the store.
 */
export function applyWorkingCopySnapshot(snapshot: WorkingCopySnapshot): void {
  useWorkingCopyStore.setState(prepareWorkingCopySnapshot(snapshot));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Snapshot the working copy to sessionStorage before an OAuth redirect.
 *
 * Only snapshots when the working copy is actually instantiated
 * (instantiationMode is non-null and ir is non-null) — a guest who clicks
 * "Sign up" with no in-progress keyboard gets nothing written.
 *
 * Wraps sessionStorage.setItem in try/catch: on quota failure the snapshot is
 * silently skipped so the redirect proceeds normally (the author will lose
 * their in-progress work, which is the pre-existing behaviour — not a regression).
 */
export function snapshotWorkingCopyToSession(): void {
  const s = useWorkingCopyStore.getState();

  // Guard: only snapshot when there is a real working copy.
  if (s.instantiationMode === null || s.ir === null) {
    return;
  }

  const snapshot = snapshotWorkingCopyData();

  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(snapshot));
  } catch {
    // Quota exceeded or private-browsing restriction — skip, don't crash.
  }
}

/**
 * Rehydrate the working copy from sessionStorage after an OAuth redirect return.
 *
 * Consumes (reads + clears) the snapshot so subsequent normal loads don't
 * accidentally clobber a freshly-instantiated working copy.
 *
 * Returns true if a snapshot was found and applied, false otherwise.
 *
 * Call this once after the auth hook rehydrates its token (i.e. from the
 * useEffect in useGitHubAuth / the mount in StudioShell), but only on paths
 * that follow an OAuth return. The consume-and-clear nature means a stale
 * snapshot from a prior interrupted session does not persist beyond the first
 * re-entry.
 *
 * spec 034 US3 / research D4: `main.tsx` calls `loadDraft()` (the durable
 * localStorage draft) BEFORE this function, so on an OAuth-return boot this
 * may legitimately layer the pre-redirect sessionStorage snapshot on top of
 * whatever the durable draft already restored.
 */
export function rehydrateWorkingCopyFromSession(): boolean {
  const raw = sessionStorage.getItem(DRAFT_KEY);
  if (raw === null) return false;

  // Always clear first so a malformed snapshot doesn't loop.
  sessionStorage.removeItem(DRAFT_KEY);

  // P2 back-port of the draftPersistence.loadDraft P0 fix: the ENTIRE
  // parse-through-apply body is one try/catch, not just JSON.parse. A
  // snapshot can be valid JSON but wrong-shaped (missing/null
  // `instantiationMode`, non-object value), or `applyWorkingCopySnapshot` can
  // throw deep inside `deserializeEntry`'s `atob()` on a corrupt Base64 VFS
  // entry. Either failure mode must not crash the OAuth-return boot.
  try {
    const snapshot = JSON.parse(raw) as WorkingCopySnapshot;

    // Basic sanity: must have instantiationMode set.
    if (
      snapshot === null ||
      typeof snapshot !== "object" ||
      snapshot.instantiationMode === null
    ) {
      return false;
    }

    applyWorkingCopySnapshot(snapshot);

    return true;
  } catch {
    return false;
  }
}

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

import type { VirtualFSEntry } from "@keyboard-studio/contracts";
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
interface SerializedEntry {
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
 * The base type is narrowed by three serialization overrides:
 *   - `baseVfs` (a VirtualFS instance) → `baseVfsEntries` (Base64-encoded plain array)
 *   - `deletedNodeIds` / `deletedItemIds` (Set<string>) → `string[]`
 * and two derived fields are dropped entirely (`removalCapabilities`, `session`)
 * because they are re-derived on rehydration, never stored.
 */
type WorkingCopySnapshot = Omit<
  WorkingCopyData,
  "baseVfs" | "deletedNodeIds" | "deletedItemIds" | "removalCapabilities" | "session"
> & {
  baseVfsEntries: SerializedEntry[];
  deletedNodeIds: string[];
  deletedItemIds: string[];
};

function serializeEntry(entry: VirtualFSEntry): SerializedEntry {
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

function deserializeEntry(raw: SerializedEntry): VirtualFSEntry {
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

  const snapshot: WorkingCopySnapshot = {
    instantiationMode: s.instantiationMode,
    baseKeyboard: s.baseKeyboard,
    baseVfsEntries: s.baseVfs !== null ? s.baseVfs.entries().map(serializeEntry) : [],
    baseIr: s.baseIr,
    identity: s.identity,
    ir: s.ir,
    deletedNodeIds: [...s.deletedNodeIds],
    deletedItemIds: [...s.deletedItemIds],
    undoStack: s.undoStack,
    phaseResults: s.phaseResults,
    irAxes: s.irAxes,
    desktopLocked: s.desktopLocked,
    touchLayoutJson: s.touchLayoutJson,
    touchDraft: s.touchDraft,
    galleryIntrosSeen: s.galleryIntrosSeen,
  };

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
 */
export function rehydrateWorkingCopyFromSession(): boolean {
  const raw = sessionStorage.getItem(DRAFT_KEY);
  if (raw === null) return false;

  // Always clear first so a malformed snapshot doesn't loop.
  sessionStorage.removeItem(DRAFT_KEY);

  let snapshot: WorkingCopySnapshot;
  try {
    snapshot = JSON.parse(raw) as WorkingCopySnapshot;
  } catch {
    return false;
  }

  // Basic sanity: must have instantiationMode set.
  if (snapshot.instantiationMode === null) {
    return false;
  }

  const baseVfs = createVirtualFS(snapshot.baseVfsEntries.map(deserializeEntry));

  // Re-derive computed fields from their restored source fields.
  // Per the derived-field policy in the module header: these are NOT stored;
  // they are recomputed here so they can't drift from their inputs.
  //
  // removalCapabilities derives from baseIr — NOT the carve working `ir`. The
  // store documents this map as "computed once at instantiation from the base
  // IR … never recomputed on carve edits." Deriving it from `ir` here would
  // diverge from that invariant the moment `ir` is mutated before the redirect.
  const removalCapabilities =
    snapshot.baseIr !== null
      ? classifyRemovalCapabilities(snapshot.baseIr)
      : new Map<string, import("@keyboard-studio/contracts").RemovalCapability>();

  const session = mergePhaseResults(snapshot.irAxes, snapshot.phaseResults);

  // Patch directly into the store.
  useWorkingCopyStore.setState({
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
    touchLayoutJson: snapshot.touchLayoutJson,
    touchDraft: snapshot.touchDraft,
    galleryIntrosSeen: snapshot.galleryIntrosSeen,
  });

  return true;
}

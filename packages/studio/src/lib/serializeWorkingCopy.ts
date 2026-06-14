// serializeWorkingCopy — canonical working-copy serialization for output (P4).
//
// Builds the FULL projected VFS from the working-copy store, then passes it
// to toZip. The projection uses the same pure helper as useWorkingCopyTransform
// so the OSK preview and the downloaded artifact are guaranteed equivalent.
//
// Steps:
//   1. Read the working-copy store (baseVfs, baseIr, keyboardId, deletedNodeIds,
//      assignments, identity).
//   2. Resolve assignments via the browser pattern library (async getById).
//   3. Clone baseVfs (createVirtualFS) so the original is never mutated.
//   4. Call projectWorkingCopyVfs (pure, in-place) on the clone.
//   5. Pass the projected VFS to toZip (via getToZip service accessor).
//   6. Return { bytes, warnings, keyboardId } so the caller can surface warnings.
//
// Entry point for PreviewShell.handleDownload and any other download / output
// trigger. If the working copy is not instantiated (baseVfs === null),
// serializeWorkingCopy returns null so the caller can show a "nothing to download"
// state.

import type { Pattern, MechanismAssignment } from "@keyboard-studio/contracts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { getToZip, getPatternLibraryService } from "./services.ts";
import { projectWorkingCopyVfs } from "./projectWorkingCopyVfs.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SerializeWorkingCopyResult {
  /** Raw zip bytes, ready for a Blob / URL.createObjectURL / download link. */
  bytes: Uint8Array;
  /** Warnings from projection steps (carve, assignments, identity). May be empty. */
  warnings: string[];
  /** The keyboard id resolved from the store (for the filename). */
  keyboardId: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Build the full projected VFS for the current working copy and zip it.
 *
 * Returns `null` when the working copy has not been instantiated (no base VFS
 * or base IR). The caller should guard on this and display an appropriate
 * "nothing to download" message or disable the download button.
 *
 * All assignments are resolved via the browser pattern library (async). The
 * function never writes to disk — the zip bytes are returned as a `Uint8Array`
 * and the caller is responsible for creating a `Blob` / object URL.
 *
 * Projection order matches {@link projectWorkingCopyVfs} exactly:
 *   1. Carve deletions
 *   2. Assignments (physical only)
 *   3. Identity (&NAME)
 *
 * This is the same order used by {@link useWorkingCopyTransform} (the OSK
 * preview hook), enforced by both callers delegating to the same
 * {@link projectWorkingCopyVfs} helper.
 *
 * @see projectWorkingCopyVfs — the pure projection helper this function uses
 * @see useWorkingCopyTransform — the hook that uses the same helper for the OSK preview
 */
export async function serializeWorkingCopy(): Promise<SerializeWorkingCopyResult | null> {
  // 1. Read current working-copy store state.
  const state = useWorkingCopyStore.getState();
  const { baseVfs, baseIr, baseKeyboard, deletedNodeIds, phaseResults, identity } = state;

  // Not-instantiated guard.
  if (baseVfs === null || baseIr === null || baseKeyboard === null) {
    return null;
  }

  // Determine the keyboard id for projection (base id) and for the zip filename.
  // The projection always runs against the base id (internal VFS paths are
  // source/<baseId>.kmn until the scaffolder internal-rename pipeline lands).
  // The zip filename uses the author-chosen identity.keyboardId when set,
  // so the downloaded artifact is named after the new keyboard even though
  // the internal paths still reference the base id.
  //
  // TODO(track1-internal-rename): when the scaffolder identity-propagation
  // pipeline is wired (source/<id>.kmn/.kps/.kvks/.kpj rename), update this
  // to project against identity.keyboardId and remove this comment.
  const keyboardId = baseKeyboard.id;
  const outputKeyboardId = identity?.keyboardId ?? keyboardId;

  // 2. Collect physical assignments from phaseResults (mirrors useWorkingCopyTransform).
  //    projectWorkingCopyVfs also filters physical defensively, so this pre-filter is
  //    an optimization (skips pre-loading touch-only pattern refs), not a correctness
  //    requirement.
  const sessionAssignments: MechanismAssignment[] = phaseResults
    .flatMap((p) => p.assignments ?? [])
    .filter((a) => a.modality === "physical");

  // 3. Build a synchronous pattern resolver backed by the async pattern library.
  //    Pre-load all referenced patterns in one async batch, then expose a sync
  //    getPattern(id) for projectWorkingCopyVfs (which calls applyAssignmentsToVfs,
  //    which is synchronous).
  const patternCache = new Map<string, Pattern>();
  if (sessionAssignments.length > 0) {
    const patternLibrary = getPatternLibraryService();
    const patternIds = [
      ...new Set(
        sessionAssignments.flatMap((a) => a.mechanisms.map((m) => m.patternId)),
      ),
    ];
    await Promise.all(
      patternIds.map(async (id) => {
        const pattern = await patternLibrary.getById(id);
        if (pattern !== undefined) {
          patternCache.set(id, pattern);
        }
      }),
    );
  }

  // 4. Clone baseVfs so the original is not mutated (projectWorkingCopyVfs is in-place).
  //    Shallow-entry clone is safe because the projection helpers replace whole
  //    entries via vfs.set() rather than mutating an entry's content buffer in place
  //    (VirtualFS.set contract). If a future projection step writes into an entry's
  //    Uint8Array directly, deep-copy the binary entries here.
  const clonedVfs = createVirtualFS(baseVfs.entries());

  // 5. Project the working copy onto the cloned VFS.
  const { warnings } = projectWorkingCopyVfs({
    vfs: clonedVfs,
    keyboardId,
    baseIr,
    deletedNodeIds,
    assignments: sessionAssignments,
    getPattern: (id) => patternCache.get(id),
    identity,
  });

  // 6. Serialize to zip.
  const toZip = await getToZip();
  const bytes = await toZip(clonedVfs);

  // When the author chose a different keyboard id than the base id, emit a
  // warning so the caller can surface it (internal paths still use base id).
  const extraWarnings: string[] = [];
  if (identity?.keyboardId !== undefined && identity.keyboardId !== keyboardId) {
    extraWarnings.push(
      `[serialize] zip named ${outputKeyboardId}.zip but internal source paths ` +
      `still reference ${keyboardId} — full id rename requires the scaffolder ` +
      `identity-propagation pipeline (see TODO(track1-internal-rename)).`,
    );
  }

  return { bytes, warnings: [...warnings, ...extraWarnings], keyboardId: outputKeyboardId };
}

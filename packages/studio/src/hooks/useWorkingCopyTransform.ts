// useWorkingCopyTransform — builds a memoized VfsTransform from the live
// working-copy store layers (carve deletions + mechanism assignments +
// identity overlay) for use with useKeyboardArtifact.
//
// This is the single shared factory for the OSK projection. Both the
// SurveyView OSK and the gallery OSK call this hook and pass the
// resulting VfsTransform into useKeyboardArtifact. The transform is memoized
// on the layer values (not object references) so a recompile fires only when
// a layer actually changes — no spurious compile cycles, no second timer
// (single 300 ms debounce contract upheld; spec §8 Decision D3).
//
// Projection order (§12 "re-projected layers"):
//   0. Touch layout — inject Phase E touchLayoutJson into .keyman-touch-layout so
//      the OSK preview reflects the touch layout the author built. Omitted when
//      touchLayoutJson is null (no Phase E edits yet).
//   1. Carve deletions — re-emit the filtered IR into the VFS .kmn, replacing
//      the fetched source. baseIr is never mutated; a filtered copy is used.
//   2. Assignments — applyAssignmentsToVfs on the carved .kmn. If no patternMap
//      is provided (SurveyView path), this step is skipped (no assignments
//      to apply until Phase C completes).
//   3. Identity — applyIdentityStubMutation writes &NAME (display name) into the
//      .kmn so the compiled keyboard's spacebar shows the new name.
//
// The actual projection logic lives in projectWorkingCopyVfs
// (packages/studio/src/lib/projectWorkingCopyVfs.ts), a pure (non-React)
// function. serializeWorkingCopy (the download/output path) also calls
// projectWorkingCopyVfs directly, so the OSK preview and the downloaded artifact
// are guaranteed equivalent for the same working-copy state.
//
// Memoization key:
//   - deletedNodeIds: serialized as a sorted join of the node ID strings.
//   - assignments: serialized as a compact key string (same as GalleryPreviewWithPatterns).
//   - identity.displayName: string or undefined.
//
// None of the above change on every render, so the VfsTransform reference
// is stable across renders when the working copy has not changed.

import { useMemo } from "react";
import type { Pattern, VirtualFS } from "@keyboard-studio/contracts";
import type { VfsTransform } from "./useKeyboardArtifact.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { projectWorkingCopyVfs } from "../lib/projectWorkingCopyVfs.ts";
import { physicalAssignmentsOf } from "../lib/physicalAssignments.ts";

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

export interface UseWorkingCopyTransformOptions {
  /**
   * Synchronous pattern resolver required by applyAssignmentsToVfs.
   * Pass null/undefined when assignments should not be projected (e.g. the
   * SurveyView path before Phase C completes). When assignments exist
   * in the store but no patternMap is supplied, a warning is added but the
   * transform still proceeds with carve + identity.
   */
  patternMap?: Map<string, Pattern> | null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Builds a memoized {@link VfsTransform} from the live working-copy layers.
 * Re-memoizes only when a layer value actually changes.
 *
 * The transform closure delegates to {@link projectWorkingCopyVfs} — the same
 * pure helper used by {@link serializeWorkingCopy} — so the OSK preview and
 * the downloaded artifact are guaranteed equivalent for the same working-copy state.
 *
 * Returns `null` when the working copy is not yet instantiated (no baseIr
 * means carve cannot run) — callers should pass `null` directly to
 * `useKeyboardArtifact`'s `vfsTransform` parameter in that case.
 */
export function useWorkingCopyTransform(
  opts?: UseWorkingCopyTransformOptions,
): VfsTransform | null {
  const patternMap = opts?.patternMap ?? null;

  // Layer values — read individually so the memo only fires when they change.
  const baseIr = useWorkingCopyStore((s) => s.baseIr);
  const deletedNodeIds = useWorkingCopyStore((s) => s.deletedNodeIds);
  const deletedItemIds = useWorkingCopyStore((s) => s.deletedItemIds);
  const identity = useWorkingCopyStore((s) => s.identity);
  // Assignments: physical only (touch is projected via touchLayoutJson below).
  const phaseResults = useWorkingCopyStore((s) => s.phaseResults);
  // Phase E touch layout — a primitive string | null; injected into the VFS by
  // projectWorkingCopyVfs (step 0) so the OSK preview reflects Phase E edits.
  const touchLayoutJson = useWorkingCopyStore((s) => s.touchLayoutJson);

  // Derive the current physical assignments from phaseResults.
  const sessionAssignments = useMemo(
    () => physicalAssignmentsOf(phaseResults),
    [phaseResults],
  );

  // Memoization keys — primitive-stable so useMemo doesn't fire on reference churn.

  // Deleted node IDs: sorted, joined string. O(n) but the carve set is small.
  const deletedKey = useMemo(
    () => [...deletedNodeIds].sort().join("|") + ";" + [...deletedItemIds].sort().join("|"),
    [deletedNodeIds, deletedItemIds],
  );

  // Assignments key — compact string (scope:target:patternId/slotValues per assignment).
  const assignmentsKey = useMemo(
    () =>
      sessionAssignments
        .map(
          (a) =>
            `${a.scope}:${a.target}:${a.mechanisms
              .map((m) => `${m.patternId}/${JSON.stringify(m.slotValues ?? {})}`)
              .join(",")}`,
        )
        .join("|"),
    [sessionAssignments],
  );

  // Identity display name + Track-1 rename id + bcp47.
  // identityKeyboardId triggers projectWorkingCopyVfs step 4 (rewrites
  // `.kmw-keyboard-<baseId>` selectors and renames siblings) when it differs
  // from the keyboardId the transform is invoked with.
  // identityBcp47 is forwarded so resetIdentity inside step 4 stamps the
  // chosen language tag onto the .kmn instead of falling back to the base's.
  const identityDisplayName = identity?.displayName ?? null;
  const identityKeyboardId = identity?.keyboardId ?? null;
  const identityBcp47 = identity?.bcp47 ?? null;

  return useMemo<VfsTransform | null>(() => {
    // No baseIr → carve step cannot run. The transform is not usable yet.
    if (baseIr === null) return null;

    const capturedDeletedIds = deletedNodeIds;
    const capturedDeletedItemIds = deletedItemIds;
    const capturedAssignments = sessionAssignments;
    const capturedDisplayName = identityDisplayName;
    const capturedKeyboardId = identityKeyboardId;
    const capturedBcp47 = identityBcp47;
    const capturedPatternMap = patternMap;
    const capturedBaseIr = baseIr;
    const capturedTouchLayoutJson = touchLayoutJson;

    return (vfs: VirtualFS, keyboardId: string): { warnings: string[] } => {
      // Assignment-warning: when assignments exist but no patternMap was supplied,
      // emit a diagnostic and skip assignments (pass empty array to projectWorkingCopyVfs).
      const preWarnings: string[] = [];
      const effectiveAssignments =
        capturedPatternMap !== null
          ? capturedAssignments
          : (() => {
              if (capturedAssignments.length > 0) {
                preWarnings.push(
                  "[working-copy-transform] assignments exist but no patternMap supplied — assignment projection skipped",
                );
              }
              return [];
            })();

      // Delegate to the pure projection helper. The VfsTransform contract is
      // in-place mutation of `vfs`; projectWorkingCopyVfs also mutates in-place.
      const identityArg =
        capturedDisplayName !== null || capturedBcp47 !== null
          ? {
              ...(capturedDisplayName !== null ? { displayName: capturedDisplayName } : {}),
              ...(capturedBcp47 !== null && capturedBcp47 !== ""
                ? { bcp47: capturedBcp47 }
                : {}),
            }
          : null;

      const { warnings: projectionWarnings } = projectWorkingCopyVfs({
        vfs,
        keyboardId,
        ...(capturedKeyboardId !== null && capturedKeyboardId !== keyboardId
          ? { targetKeyboardId: capturedKeyboardId }
          : {}),
        baseIr: capturedBaseIr,
        deletedNodeIds: capturedDeletedIds,
        deletedItemIds: capturedDeletedItemIds,
        assignments: effectiveAssignments,
        getPattern: (id) => capturedPatternMap?.get(id),
        identity: identityArg,
        touchLayoutJson: capturedTouchLayoutJson,
      });

      return { warnings: [...preWarnings, ...projectionWarnings] };
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    baseIr,
    deletedKey,
    assignmentsKey,
    identityDisplayName,
    identityKeyboardId,
    identityBcp47,
    patternMap,
    touchLayoutJson,
  ]);
}

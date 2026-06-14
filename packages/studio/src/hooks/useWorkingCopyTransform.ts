// useWorkingCopyTransform — builds a memoized VfsTransform from the live
// working-copy store layers (carve deletions + mechanism assignments +
// identity overlay) for use with useKeyboardArtifact.
//
// This is the single shared factory for the OSK projection. Both the
// survey/pick-base OSK and the gallery OSK call this hook and pass the
// resulting VfsTransform into useKeyboardArtifact. The transform is memoized
// on the layer values (not object references) so a recompile fires only when
// a layer actually changes — no spurious compile cycles, no second timer
// (single 300 ms debounce contract upheld; spec §8 Decision D3).
//
// Projection order (§12 "re-projected layers"):
//   1. Carve deletions — re-emit the filtered IR into the VFS .kmn, replacing
//      the fetched source. baseIr is never mutated; a filtered copy is used.
//   2. Assignments — applyAssignmentsToVfs on the carved .kmn. If no patternMap
//      is provided (survey/pick-base path), this step is skipped (no assignments
//      to apply until Phase C completes).
//   3. Identity — applyIdentityStubMutation writes &NAME (display name) into the
//      .kmn so the compiled keyboard's spacebar shows the new name.
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
import { applyCarveToVfs } from "@keyboard-studio/engine";
import { applyAssignmentsToVfs } from "@keyboard-studio/engine";
import { applyIdentityStubMutation } from "@keyboard-studio/engine";

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

export interface UseWorkingCopyTransformOptions {
  /**
   * Synchronous pattern resolver required by applyAssignmentsToVfs.
   * Pass null/undefined when assignments should not be projected (e.g. the
   * survey/pick-base path before Phase C completes). When assignments exist
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
  const identity = useWorkingCopyStore((s) => s.identity);
  // Assignments: physical only (touch is a separate gallery).
  const phaseResults = useWorkingCopyStore((s) => s.phaseResults);

  // Derive the current physical assignments from phaseResults (same logic as
  // MechanismGallery — avoids a second selector that would double-trigger).
  const sessionAssignments = useMemo(
    () =>
      phaseResults
        .flatMap((p) => p.assignments ?? [])
        .filter((a) => a.modality === "physical"),
    [phaseResults],
  );

  // Memoization keys — primitive-stable so useMemo doesn't fire on reference churn.

  // Deleted node IDs: sorted, joined string. O(n) but the carve set is small.
  const deletedKey = useMemo(
    () => [...deletedNodeIds].sort().join("|"),
    [deletedNodeIds],
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

  // Identity display name.
  // Memo key is name-only because applyIdentityStubMutation currently consumes
  // only the display name. bcp47 and targetScript are intentionally excluded.
  // When identity projection is extended to also apply bcp47/targetScript,
  // widen this key AND the mutation call in the closure together.
  const identityDisplayName = identity?.displayName ?? null;

  return useMemo<VfsTransform | null>(() => {
    // No baseIr → carve step cannot run. The transform is not usable yet.
    if (baseIr === null) return null;

    // Capture current values into the closure. The closure captures:
    //   - baseIr (stable object reference from the store, never mutated)
    //   - deletedNodeIds (the actual Set — snapshot frozen at memo creation time)
    //   - sessionAssignments (array snapshot)
    //   - identityDisplayName (string or null)
    //   - patternMap (from the calling component)
    const capturedDeletedIds = deletedNodeIds;
    const capturedAssignments = sessionAssignments;
    const capturedDisplayName = identityDisplayName;
    const capturedPatternMap = patternMap;
    const capturedBaseIr = baseIr;

    return (vfs: VirtualFS, keyboardId: string): { warnings: string[] } => {
      const warnings: string[] = [];

      // Step 1: Carve projection — re-emit IR with deleted nodes filtered out.
      // Writes `source/<keyboardId>.kmn` back to the VFS. When deletedNodeIds
      // is empty, applyCarveToVfs is a no-op (fast path).
      const carveResult = applyCarveToVfs(
        vfs,
        keyboardId,
        capturedBaseIr,
        capturedDeletedIds,
      );
      warnings.push(...carveResult.warnings);

      // Step 2: Assignments projection. Skipped when no patternMap is available
      // or when there are no assignments to apply.
      if (capturedPatternMap !== null && capturedAssignments.length > 0) {
        const assignResult = applyAssignmentsToVfs(
          vfs,
          keyboardId,
          capturedAssignments,
          (id) => capturedPatternMap.get(id),
        );
        warnings.push(...assignResult.warnings);
      } else if (capturedPatternMap === null && capturedAssignments.length > 0) {
        warnings.push(
          "[working-copy-transform] assignments exist but no patternMap supplied — assignment projection skipped",
        );
      }

      // Step 3: Identity projection — re-write &NAME in the .kmn so the compiled
      // keyboard's spacebar caption reflects the user's identity edit.
      if (capturedDisplayName !== null) {
        try {
          applyIdentityStubMutation(vfs, keyboardId, { name: capturedDisplayName });
        } catch (err: unknown) {
          // The stub mutator throws if the file is missing — that can happen when
          // carve projection removed all rules and the file no longer exists
          // (pathological case). Warn rather than abort the compile.
          const msg = err instanceof Error ? err.message : String(err);
          warnings.push(`[working-copy-transform] identity projection skipped: ${msg}`);
        }
      }

      return { warnings };
    };
    // Depend on primitive-stable memo keys + patternMap reference (stable when
    // the calling component memoizes it correctly, as GalleryPreviewWithPatterns does).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseIr, deletedKey, assignmentsKey, identityDisplayName, patternMap]);
}

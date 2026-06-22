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

import type { Pattern, MechanismAssignment, VirtualFS } from "@keyboard-studio/contracts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { getToZip, getPatternLibraryService } from "./services.ts";
import { projectWorkingCopyVfs } from "./projectWorkingCopyVfs.ts";
import type { IdentityOverlay } from "./projectWorkingCopyVfs.ts";
import { physicalAssignmentsOf } from "./physicalAssignments.ts";
import { bumpKeyboardVersion, stageAdaptHistory } from "@keyboard-studio/engine";

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
  /**
   * The keyboard release version, for the `<id>-<version>.zip` filename.
   * Read from the base IR header (`&KEYBOARDVERSION` on import, the scaffolder's
   * keyboard release version on a fresh base), defaulting to `"1.0"`. This is the
   * human-visible release version — NOT the `&VERSION` KMN file-format version.
   */
  version: string;
}

/**
 * Result of {@link projectWorkingCopyForOutput} — the projected (cloned)
 * VirtualFS plus the metadata callers need, BEFORE serialization.
 *
 * The zip path ({@link serializeWorkingCopy}) feeds {@link vfs} to toZip; the
 * GitHub fork+PR path feeds the same {@link vfs} to publishPR. Both consume the
 * identical projected tree so the downloaded artifact and the committed PR are
 * guaranteed equivalent.
 */
export interface ProjectWorkingCopyForOutputResult {
  /** The projected (cloned) VirtualFS — never the store's original baseVfs. */
  vfs: VirtualFS;
  /** Author-chosen keyboard id (identity.keyboardId) or the base id (filename / branch). */
  keyboardId: string;
  /** Author-chosen display name (identity.displayName) or the base displayName. */
  displayName: string;
  /** Keyboard version (identity has no version field yet, so the base version). */
  version: string;
  /** Warnings from projection steps (carve, assignments, identity). May be empty. */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Build the full projected (cloned) VFS for the current working copy.
 *
 * This is the shared projection step for BOTH output paths — the zip download
 * ({@link serializeWorkingCopy}) and the GitHub fork+PR path (publishPR). It
 * returns the projected VirtualFS itself (not zip bytes) so the PR path can
 * commit the same tree the zip would contain.
 *
 * Returns `null` when the working copy has not been instantiated (no base VFS
 * or base IR). The caller should guard on this and display an appropriate
 * "nothing to download" message or disable the submit button.
 *
 * All assignments are resolved via the browser pattern library (async). The
 * function never writes to disk — it clones baseVfs and projects onto the clone.
 *
 * Projection order matches {@link projectWorkingCopyVfs} exactly:
 *   0. Touch layout (Phase E touchLayoutJson → .keyman-touch-layout)
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
 * @see serializeWorkingCopy — wraps this and zips the result for download
 */
export async function projectWorkingCopyForOutput(): Promise<ProjectWorkingCopyForOutputResult | null> {
  // 1. Read current working-copy store state.
  const state = useWorkingCopyStore.getState();
  const { baseVfs, baseIr, baseKeyboard, deletedNodeIds, deletedItemIds, phaseResults, identity, touchLayoutJson, instantiationMode } = state;

  // Not-instantiated guard.
  if (baseVfs === null || baseIr === null || baseKeyboard === null) {
    return null;
  }

  // Carve / assignments / identity run against the base id (VFS paths are
  // still source/<baseId>.kmn at that point). When identity.keyboardId is set
  // and differs, projectWorkingCopyVfs's final rename step rewrites the .kmn
  // path stores, renames source/<baseId>.* → source/<newId>.*, and rewrites
  // `.kmw-keyboard-<baseId>` selectors in *.css plus <ID> / <kbdname>
  // references in *.kps and *.kvks.
  const keyboardId = baseKeyboard.id;
  const outputKeyboardId = identity?.keyboardId ?? keyboardId;

  // Keyboard release version for the `<id>-<version>.zip` filename. baseIr.header.version
  // carries &KEYBOARDVERSION on import (codec/parse prefers it over &VERSION) and the
  // scaffolder's keyboard release version on a fresh base. Fall back to "1.0" if absent —
  // never the &VERSION file-format version (e.g. "14.0").
  // Declared `let` so the adapt path can reassign to the bumped version.
  const rawVersion = baseIr.header.version?.trim() || "1.0";
  let version = rawVersion.replace(/[^\w.\-]/g, "_");

  // 2. Collect physical assignments from phaseResults (mirrors useWorkingCopyTransform).
  //    projectWorkingCopyVfs also filters physical defensively, so this pre-filter is
  //    an optimization (skips pre-loading touch-only pattern refs), not a correctness
  //    requirement.
  const sessionAssignments: MechanismAssignment[] = physicalAssignmentsOf(phaseResults);

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

  // 4a. Track 2 (adapt-existing) output-only staging: bump version and prepend
  //     HISTORY.md entry. This block must NOT run on the OSK preview path — it is
  //     an output-only concern (spec §12). The preview correctly shows the original
  //     version via projectWorkingCopyVfs → applyIdentityStubMutation.
  //
  // The bumped version is:
  //   - written into the .kmn &KEYBOARDVERSION via identity.version (step 5 below),
  //   - written into the .kps <Keyboards><Keyboard><Version> element (here, via regex),
  //   - returned as `version` in the result so the zip filename uses the bumped value.
  //
  // The .kps patch uses a targeted regex on the <Keyboards><Keyboard><Version> element.
  // The existing .kps always has this element because buildKpsContent (scaffolder) always
  // emits it, and Track 2 imports an existing keyboard that will have a .kps already.
  // Typed as the ProjectWorkingCopyVfsInput identity shape (not IdentityPatch) so the
  // adapt path can add `version` without excess-property errors. Map the common fields
  // (displayName, bcp47) from IdentityPatch; `copyright` and `version` are
  // ProjectWorkingCopyVfsInput-only fields that IdentityPatch does not carry.
  // `keyboardId` is intentionally excluded from identityForProjection: it is
  // passed separately as `targetKeyboardId` to `projectWorkingCopyVfs` (not
  // dropped by accident). The rename pass runs there when targetKeyboardId
  // differs from keyboardId.
  let identityForProjection: IdentityOverlay | null = identity !== null ? {
    ...(identity.displayName !== undefined ? { displayName: identity.displayName } : {}),
    ...(identity.bcp47 !== undefined ? { bcp47: identity.bcp47 } : {}),
  } : null;
  // Accumulated warnings for the adapt path — merged with projection warnings below.
  const adaptWarnings: string[] = [];
  if (instantiationMode === "adapt-existing") {
    const bumpedVersion = bumpKeyboardVersion(rawVersion);
    version = bumpedVersion.replace(/[^\w.\-]/g, "_");

    // Stage the HISTORY.md entry (prepend, newest-first).
    // See also: packages/engine/src/scaffolder/index.ts generateStubs() — the
    // Track-1 HISTORY.md entry format. Keep both in sync if the format changes.
    const dateIso = new Date().toISOString().slice(0, 10);
    stageAdaptHistory(clonedVfs, outputKeyboardId, keyboardId, rawVersion, bumpedVersion, dateIso);

    // Patch the .kps <Keyboards><Keyboard><Version> element.
    //
    // Regex assumption: <Version> appears INSIDE <Keyboards><Keyboard>, not
    // outside or under <Info>. The anchored pattern requires the <Keyboard> open
    // tag before the <Version> match, so a stray top-level <Version> (e.g. under
    // <Info> or <FileVersion>) is not touched.
    //
    // buildKpsContent (scaffolder) always emits exactly one <Keyboards> block
    // with exactly one <Keyboard> child and one <Version>. Imported keyboards
    // that share this shape are patched; those that don't (unusual/legacy layouts)
    // emit a warning so the user knows the .kmn and .kps versions may differ.
    const kpsPath = `source/${keyboardId}.kps`;
    const kpsEntry = clonedVfs.get(kpsPath);
    if (kpsEntry !== undefined && typeof kpsEntry.content === "string") {
      const patchedKps = kpsEntry.content.replace(
        /(<Keyboards>[\s\S]*?<Keyboard>[\s\S]*?<Version>)[^<]*(< *\/Version>)/,
        `$1${bumpedVersion}$2`,
      );
      if (patchedKps !== kpsEntry.content) {
        clonedVfs.set(kpsPath, patchedKps, false);
      } else {
        // Regex produced no change — the .kps does not have <Version> inside
        // <Keyboards><Keyboard>, so the element could not be patched. Warn so the
        // user is aware the .kmn &KEYBOARDVERSION was bumped but the .kps <Version>
        // was not updated.
        adaptWarnings.push(
          `[adapt] could not update .kps <Version> to ${bumpedVersion}; .kps and .kmn versions may differ in the output`,
        );
      }
    }

    // Merge the bumped version into the identity overlay so applyIdentityStubMutation
    // writes &KEYBOARDVERSION into the .kmn during step 5.
    // `identityForProjection` already holds the mapped displayName/bcp47 from above;
    // we only need to set/override the version field here.
    identityForProjection = {
      ...(identityForProjection ?? {}),
      version: bumpedVersion,
    };
  }

  // 5. Project the working copy onto the cloned VFS. targetKeyboardId triggers
  //    the final rename pass when the author picked a different id.
  const { warnings: projectionWarnings } = projectWorkingCopyVfs({
    vfs: clonedVfs,
    keyboardId,
    targetKeyboardId: outputKeyboardId,
    baseIr,
    deletedNodeIds,
    deletedItemIds,
    assignments: sessionAssignments,
    getPattern: (id) => patternCache.get(id),
    identity: identityForProjection,
    touchLayoutJson,
  });

  // 6. Merge the adapt-path warnings (HISTORY/.kps staging) with the projection
  //    warnings. Both output paths (zip + PR) surface the same set.
  //
  //    No internal-path mismatch warning is emitted when identity.keyboardId
  //    differs from the base id: projectWorkingCopyVfs's targetKeyboardId rename
  //    pass (run in step 5 above) now rewrites source/<baseId>.* → source/<newId>.*
  //    and the in-file id references, so the output is internally consistent.
  const warnings = [...adaptWarnings, ...projectionWarnings];

  // Return the projected VFS plus metadata. `version` carries main's computed /
  // bumped value (the adapt-existing path reassigns it above), so BOTH the zip
  // filename and the PR path get the correct release version.
  return {
    vfs: clonedVfs,
    keyboardId: outputKeyboardId,
    displayName: identity?.displayName ?? baseKeyboard.displayName,
    version,
    warnings,
  };
}

/**
 * Build the full projected VFS for the current working copy and zip it.
 *
 * Returns `null` when the working copy has not been instantiated (no base VFS
 * or base IR). The caller should guard on this and display an appropriate
 * "nothing to download" message or disable the download button.
 *
 * Delegates the projection to {@link projectWorkingCopyForOutput} (the same
 * pure helper the GitHub fork+PR path consumes), then serializes the projected
 * VFS to zip via the toZip service accessor. The public return shape
 * ({@link SerializeWorkingCopyResult}) is a superset of the projection metadata
 * plus the zip bytes — PreviewShell, the existing tests, and the
 * `<id>-<version>.zip` filename all depend on the `version` field.
 *
 * @see projectWorkingCopyForOutput — the projection helper (returns the VFS)
 */
export async function serializeWorkingCopy(): Promise<SerializeWorkingCopyResult | null> {
  const projected = await projectWorkingCopyForOutput();
  if (projected === null) {
    return null;
  }

  // Serialize to zip.
  const toZip = await getToZip();
  const bytes = await toZip(projected.vfs);

  return {
    bytes,
    warnings: projected.warnings,
    keyboardId: projected.keyboardId,
    version: projected.version,
  };
}

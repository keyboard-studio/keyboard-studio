// projectWorkingCopyVfs — pure (non-React) helper that applies the three
// working-copy projection layers onto a VirtualFS.
//
// Called by both:
//   - useWorkingCopyTransform (hook, React path) — for the live OSK preview;
//     the caller passes the VFS already scoped to the current compile cycle.
//   - serializeWorkingCopy (async function, output path) — for the download zip;
//     the caller passes a freshly cloned VFS so the base is not mutated.
//
// This shared helper is the single definition of the projection ordering, so the
// preview and the downloaded artifact are guaranteed equivalent for any given
// working-copy state.
//
// Projection order (spec §12 "re-projected layers"):
//   1. Carve deletions  — applyCarveToVfs (re-emits filtered IR into .kmn)
//   2. Assignments      — applyAssignmentsToVfs (injects mechanism patterns)
//   3. Identity         — applyIdentityStubMutation (writes &NAME)
//
// The function mutates `vfs` in-place. Callers that need the original VFS
// preserved must clone it before calling (e.g. createVirtualFS(baseVfs.entries())).

import type { KeyboardIR, Pattern, VirtualFS } from "@keyboard-studio/contracts";
import type { MechanismAssignment } from "@keyboard-studio/contracts";
import {
  applyCarveToVfs,
  applyAssignmentsToVfs,
  applyIdentityStubMutation,
  applyKeycapLabelsToVfs,
  parseKmn,
  emitKmn,
  resetIdentity,
  renameFilesInVfs,
} from "@keyboard-studio/engine";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * All inputs needed to project a working copy onto a VFS.
 *
 * - `vfs`             — the VFS to mutate in-place (clone before calling if you
 *                       need to preserve the original).
 * - `keyboardId`      — keyboard identifier used to derive source/<id>.kmn paths.
 * - `baseIr`          — the source-of-truth IR (never mutated by projection).
 * - `deletedNodeIds`  — set of carve deletions.
 * - `assignments`     — mechanism assignments from phaseResults. Physical-only
 *                       filtering is applied inside this function defensively, so
 *                       callers may pass the full list or a pre-filtered physical one.
 * - `getPattern`      — synchronous pattern resolver for assignments.
 * - `identity`        — display name (and optionally other fields) to inject.
 */
export interface ProjectWorkingCopyVfsInput {
  vfs: VirtualFS;
  /**
   * Keyboard identifier used to locate `source/<keyboardId>.kmn` for the carve /
   * assignment / identity projection steps. This is the base keyboard's id while
   * the rest of the VFS still uses base-id filenames; the optional id rename
   * step (below) renames it to `targetKeyboardId` at the end.
   */
  keyboardId: string;
  /**
   * Optional new keyboard id chosen by the author (Track 1 identity rename or
   * Track 2 fork). When set and different from `keyboardId`, the projection
   * adds a final pass that:
   *   - rewrites the .kmn's sibling-file path stores (&KMW_EMBEDCSS,
   *     &KMW_HELPFILE, &VISUALKEYBOARD, &LAYOUTFILE, &BITMAP) via resetIdentity,
   *   - renames source/<keyboardId>.* → source/<targetKeyboardId>.* for
   *     `.kmn .kps .kvks .keyman-touch-layout .ico .css .htm .js` and the
   *     `help/<id>.php` sibling, and
   *   - rewrites `.kmw-keyboard-<keyboardId>` selectors in *.css and
   *     `<ID>` / `<kbdname>` references in *.kps and *.kvks.
   * Omit or pass the same value as `keyboardId` to skip the rename pass.
   */
  targetKeyboardId?: string;
  baseIr: KeyboardIR;
  deletedNodeIds: ReadonlySet<string>;
  /** Individual rule nodeIds removed via glyph-level carving (GlyphCell clicks). */
  deletedItemIds?: ReadonlySet<string>;
  assignments: ReadonlyArray<MechanismAssignment>;
  /** Synchronous resolver. Pass `() => undefined` when no pattern library is available. */
  getPattern: (id: string) => Pattern | undefined;
  /** Identity overlay. Pass `null` to skip identity projection. */
  identity: IdentityOverlay | null;
}

/**
 * Shape of the optional identity overlay accepted by {@link ProjectWorkingCopyVfsInput}.
 *
 * Exported so callers (e.g. serializeWorkingCopy) can type their local overlay
 * variable against this single source rather than repeating the inline literal.
 */
export type IdentityOverlay = {
  displayName?: string;
  copyright?: string;
  version?: string;
  bcp47?: string;
};

export interface ProjectWorkingCopyVfsResult {
  /** Warnings from any of the three projection steps (empty when all is well). */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Apply carve + assignments + identity projection layers onto `input.vfs`
 * in-place, returning any accumulated warnings.
 *
 * `input.vfs` IS mutated. Callers that need the original VFS preserved must
 * clone it before calling: `createVirtualFS(baseVfs.entries())`.
 *
 * Projection steps are identical for both the OSK preview path
 * (`useWorkingCopyTransform`) and the output/serialization path
 * (`serializeWorkingCopy`), ensuring the two are always equivalent.
 */
export function projectWorkingCopyVfs(
  input: ProjectWorkingCopyVfsInput,
): ProjectWorkingCopyVfsResult {
  const {
    vfs,
    keyboardId,
    targetKeyboardId,
    baseIr,
    deletedNodeIds,
    deletedItemIds = new Set<string>(),
    assignments,
    getPattern,
    identity,
  } = input;

  const warnings: string[] = [];

  // Step 1: Carve projection — re-emit IR with deleted nodes filtered out.
  // Writes `source/<keyboardId>.kmn` back into vfs. When deletedNodeIds is
  // empty, applyCarveToVfs is a no-op (fast path).
  const allDeletedIds = deletedItemIds.size > 0
    ? new Set([...deletedNodeIds, ...deletedItemIds])
    : deletedNodeIds;
  const carveResult = applyCarveToVfs(vfs, keyboardId, baseIr, allDeletedIds);
  warnings.push(...carveResult.warnings);

  // Step 2: Assignments projection — inject mechanism pattern fragments.
  // Physical-only: touch assignments are handled by a separate gallery.
  // Skipped when there are no physical assignments.
  const physicalAssignments = assignments.filter((a) => a.modality === "physical");
  if (physicalAssignments.length > 0) {
    const assignResult = applyAssignmentsToVfs(
      vfs,
      keyboardId,
      physicalAssignments,
      getPattern,
    );
    warnings.push(...assignResult.warnings);
  }

  // Step 3: Identity projection — write &NAME (display name) into the .kmn.
  if (identity !== null) {
    const identityArg: { name?: string; copyright?: string; version?: string } = {};
    if (identity.displayName !== undefined) identityArg.name = identity.displayName;
    if (identity.copyright !== undefined) identityArg.copyright = identity.copyright;
    if (identity.version !== undefined) identityArg.version = identity.version;

    if (Object.keys(identityArg).length > 0) {
      try {
        applyIdentityStubMutation(vfs, keyboardId, identityArg);
      } catch (err: unknown) {
        // The stub mutator throws if the file is missing (e.g. carve removed all
        // rules and the file was never written). Warn rather than abort.
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(
          `[project-working-copy] identity projection skipped: ${msg}`,
        );
      }
    }
  }

  // Step 3.5: Keycap label projection — patch .kvks and .keyman-touch-layout so
  // the desktop and touch OSK preview shows the swapped character on the keycap.
  // Runs after identity (which only touches .kmn) and before id-rename (which
  // renames source/<keyboardId>.* siblings — patched assets are carried along).
  if (physicalAssignments.length > 0) {
    try {
      const keycapResult = applyKeycapLabelsToVfs(vfs, keyboardId, physicalAssignments);
      warnings.push(...keycapResult.warnings);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`[project-working-copy] keycap label projection skipped: ${msg}`);
    }
  }

  // Step 4: Id rename — only when the author chose a different keyboard id.
  // Rewrites the .kmn's sibling-file path stores (so &KMW_EMBEDCSS et al. point
  // at the new filenames), renames source/<keyboardId>.* siblings, and rewrites
  // `.kmw-keyboard-<keyboardId>` selectors in *.css plus <ID> / <kbdname>
  // references in *.kps / *.kvks. Without this, a renamed keyboard ships with
  // CSS that targets the base id's wrapper class and never matches.
  if (
    targetKeyboardId !== undefined &&
    targetKeyboardId !== keyboardId
  ) {
    const kmnPath = `source/${keyboardId}.kmn`;
    const kmnEntry = vfs.get(kmnPath);
    if (kmnEntry !== undefined && typeof kmnEntry.content === "string") {
      try {
        const parsed = parseKmn(kmnEntry.content, keyboardId);
        resetIdentity(parsed.ir, {
          keyboardId: targetKeyboardId,
          displayName: identity?.displayName ?? parsed.ir.header.name ?? targetKeyboardId,
          ...(identity?.bcp47 !== undefined && identity.bcp47 !== ""
            ? { bcp47: [identity.bcp47] }
            : {}),
          ...(identity?.version !== undefined ? { version: identity.version } : {}),
          ...(identity?.copyright !== undefined ? { copyright: identity.copyright } : {}),
        });
        vfs.set(kmnPath, emitKmn(parsed.ir), false);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(
          `[project-working-copy] id rename: .kmn store rewrite skipped: ${msg}`,
        );
      }
    }
    renameFilesInVfs(vfs, keyboardId, targetKeyboardId);
  }

  return { warnings };
}

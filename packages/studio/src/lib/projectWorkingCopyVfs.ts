// projectWorkingCopyVfs — pure (non-React) helper that applies the working-copy
// projection layers onto a VirtualFS.
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
//   0. Touch layout     — inject Phase E touchLayoutJson into .keyman-touch-layout
//   1. Carve deletions  — applyCarveToVfs (re-emits filtered IR into .kmn)
//   2. Assignments      — applyAssignmentsToVfs (injects mechanism patterns)
//   3. Identity         — applyIdentityStubMutation (writes &NAME)
//
// Touch layout is injected FIRST (step 0) so:
//   - Step 3.5 keycap-label patch (applyKeycapLabelsToVfs) patches the injected layout.
//   - Step 4 id-rename pass renames source/<keyboardId>.keyman-touch-layout →
//     source/<targetKeyboardId>.keyman-touch-layout when the author chose a new id.
// Previously the output path (serializeWorkingCopy) injected touchLayoutJson inline
// before calling this helper; centralizing it here ensures the preview path also
// receives the Phase E touch layout.
//
// The function mutates `vfs` in-place. Callers that need the original VFS
// preserved must clone it before calling (e.g. createVirtualFS(baseVfs.entries())).

import type { KeyboardIR, Pattern, VirtualFS } from "@keyboard-studio/contracts";
import type { MechanismAssignment } from "@keyboard-studio/contracts";
import {
  applyCarveToVfs,
  applyStoreSlotRemovals,
  applyAssignmentsToVfs,
  applyIdentityStubMutation,
  applyKeycapLabelsToVfs,
  parseKmn,
  emitKmn,
  resetIdentity,
  renameFilesInVfs,
  parseSlotId,
} from "@keyboard-studio/engine";
import { applyCarveMutate, applyAddGalleryMutate } from "../steps/editorMutate.ts";
import { isMutateSeamEnabled } from "../flags/mutateFlag.ts";

/** Shared empty deletion set for the seam-path emit (the seam already filtered). */
const EMPTY_DELETION_SET: ReadonlySet<string> = new Set<string>();

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
 * - `touchLayoutJson` — optional Phase E touch layout JSON string to inject into
 *                       `source/<keyboardId>.keyman-touch-layout` before any other
 *                       projection step. When `null` or `undefined`, no touch layout
 *                       is written (the base VFS touch layout file, if any, is used).
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
  /**
   * Optional Phase E touch layout JSON string. When provided (non-null, non-undefined),
   * written into `source/<keyboardId>.keyman-touch-layout` at step 0, before carve,
   * assignments, identity, and the keycap-label + id-rename passes.
   *
   * Injecting first ensures the keycap-label patch (step 3.5) and the id-rename pass
   * (step 4) operate on the Phase E layout rather than the base VFS's layout.
   */
  touchLayoutJson?: string | null;
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
    touchLayoutJson,
  } = input;

  const warnings: string[] = [];

  // Step 0: Touch layout injection — write the Phase E touch layout JSON into
  // `source/<keyboardId>.keyman-touch-layout` before any other projection step.
  // Injecting here (rather than at each call site) ensures that:
  //   - the keycap-label patch (step 3.5) patches the injected layout, and
  //   - the id-rename pass (step 4) renames the file when the author chose a new id.
  // Previously serializeWorkingCopy injected this inline before calling this helper;
  // centralizing it here is the fix that makes the OSK preview equivalent to the ZIP.
  if (touchLayoutJson !== null && touchLayoutJson !== undefined) {
    vfs.set(`source/${keyboardId}.keyman-touch-layout`, touchLayoutJson, false);
  }

  // Step 1: Carve projection — re-emit IR with deleted nodes filtered out.
  //
  // deletedItemIds can carry two kinds of entries:
  //   a) Slot ids: "<storeNodeId>#<itemsIndex>" — parallel-store deadkey slots to
  //      replace with `nul` fillers (alignment-preserving; see applyStoreSlotRemovals).
  //   b) Whole-node item ids: bare rule/store nodeIds from glyph-level carving.
  //
  // Partition them so the two mechanisms receive the correct inputs.
  // An id that does not parse as a slot id (parseSlotId returns null — e.g. bare
  // rule nodeIds whose suffix is not an integer) falls through to wholeNodeItemIds
  // and is treated as a whole-node deletion. An id that does parse as a slot id
  // but whose store is not found in baseIr also falls through to wholeNodeItemIds
  // and becomes a no-op whole-node deletion (applyStoreSlotRemovals never sees it).
  const storeNodeIdSet = new Set(baseIr.stores.map((s) => s.nodeId));

  const slotIds = new Set<string>();
  const wholeNodeItemIds = new Set<string>();

  for (const id of deletedItemIds) {
    const parsed = parseSlotId(id);
    if (parsed !== null && storeNodeIdSet.has(parsed.storeNodeId)) {
      slotIds.add(id);
    } else {
      wholeNodeItemIds.add(id);
    }
  }

  // 1a: Replace output-store slots with nul fillers (store-slot deletion path).
  const removalResult = applyStoreSlotRemovals(baseIr, slotIds);
  warnings.push(...removalResult.warnings);

  // 1b: Whole-node deletions + VFS re-emit.
  //     forceEmit: true when any slots were targeted — the nul-modified IR must
  //     be written into the VFS even if no whole-node deletions are present.
  //     When all slot ids are rejected by the transform's guards, forceEmit still
  //     triggers a (harmless, idempotent) re-emit of the unmodified IR.
  const carveIr = removalResult.ir; // equals baseIr when slotIds was empty
  const allWholeNodeIds = new Set([...deletedNodeIds, ...wholeNodeItemIds]);

  // spec-014 T016c — carve IR-projection via the single mutate() write seam.
  //
  // Flag-on: derive the deletion-filtered carve IR through applyCarveMutate
  // (which routes the carve patch through applyMutatePatch / CARVE_WRITES) and
  // hand THAT pre-filtered IR to applyCarveToVfs with an empty deletion set so
  // the emit step only serializes — the seam, not applyCarveToVfs's internal
  // filter, is the canonical IR producer (M6/SC-001).
  //
  // The patch is built from baseIr (never the slot-rewritten carveIr) so it is a
  // pure function of the overlay (idempotent + reversible). The entry-group
  // safety gate is preserved: when the deletion set would remove the entry group
  // we DEFER to the legacy applyCarveToVfs call, which warns and skips the
  // re-emit (the seam IR would otherwise have silently dropped it). This keeps
  // the emitted artifact byte-identical to the flag-off path.
  const entryGroup = baseIr.groups.find((g) => !g.readonly);
  const entryGroupDeleted =
    entryGroup !== undefined && allWholeNodeIds.has(entryGroup.nodeId);

  // Whether carve has any edit at all. The legacy path re-emits the .kmn iff
  // there is a whole-node deletion OR a store-slot rewrite; with no edits it
  // leaves the fetched base .kmn untouched (no re-emit). The seam path must
  // match this exactly so an unedited working copy stays byte-identical.
  const hasCarveEdit = allWholeNodeIds.size > 0 || slotIds.size > 0;

  let carveResult: { warnings: string[] };
  if (isMutateSeamEnabled() && !entryGroupDeleted && hasCarveEdit) {
    const seamIr = applyCarveMutate(baseIr, deletedNodeIds, deletedItemIds);
    // The seam already filtered every node; hand it to emit with an empty
    // deletion set. forceEmit:true because there IS an edit (matching the
    // legacy emit-when-edited behavior); an unedited copy never reaches here.
    carveResult = applyCarveToVfs(vfs, keyboardId, seamIr, EMPTY_DELETION_SET, {
      forceEmit: true,
    });
  } else {
    carveResult = applyCarveToVfs(vfs, keyboardId, carveIr, allWholeNodeIds, {
      forceEmit: slotIds.size > 0,
    });
  }
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

    // spec-014 T017 — add-gallery IR projection via the single mutate() seam.
    //
    // The reference emit above is text-based (applyAssignmentsToVfs writes the
    // injected .kmn directly, byte-identical in both flag states). When the flag
    // is on we ALSO derive the canonical assignment IR through the mutate() write
    // path: parse the just-written .kmn back to IR and route its physical-assignment
    // arrays (groups[]/stores[]) through applyAddGalleryMutate (applyMutatePatch /
    // ADD_GALLERY_WRITES). This makes mutate() the single IR write route for the
    // add surface (M6/SC-001) and enforces declared-writes containment (M3) — the
    // patch can never reach header, comments, or the deferred keycap/touch targets.
    // The derived IR is intentionally NOT re-emitted: the text artifact stays
    // byte-identical to the flag-off path. Keycap-label / touch-layout projection
    // is deferred to US2.
    if (isMutateSeamEnabled()) {
      const entry = vfs.get(`source/${keyboardId}.kmn`);
      if (entry !== undefined && typeof entry.content === "string") {
        try {
          const assignedIr = parseKmn(entry.content, keyboardId).ir;
          // Route through the seam; a containment violation (M3) surfaces here.
          applyAddGalleryMutate(carveIr, assignedIr);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          warnings.push(
            `[project-working-copy] add-gallery mutate-seam derivation skipped: ${msg}`,
          );
        }
      }
    }
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

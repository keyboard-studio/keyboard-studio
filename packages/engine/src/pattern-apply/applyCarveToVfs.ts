// Carve-layer projection: filter deleted IR nodes and re-emit .kmn to VFS.
//
// This is the non-destructive carve projection for the live OSK pipeline.
// Given a base IR and a set of deleted node IDs, produces a new IR with those
// nodes removed (without mutating baseIr) and emits it back into the VFS so
// the compile step sees the carved keyboard.
//
// Deletion semantics (spec §8/§12 "re-projected layers"):
//   - IRGroup nodes: the entire group (header + all rules) is dropped.
//   - IRRule nodes: the specific rule is dropped from its parent group.
//   - IRStore nodes: the store is dropped.
//   - RawKmnFragment nodes: the raw fragment is dropped.
//   - IRComment nodes: comments are not individually deleteable via carve.
//
// baseIr is never mutated. A shallow copy of the IR is constructed with the
// filtered arrays. Groups whose rules are all deleted are NOT auto-deleted
// (the group header remains unless the group's own nodeId is in deletedNodeIds).
//
// Safety gate: the set of deleted nodes must not remove the entry group — the
// first non-readonly group that emit() picks for `begin Unicode > use(...)`.
// Removing it would silently retarget the begin directive. When this condition
// fails, the carve step is skipped and a warning is returned; the VFS is left
// unchanged.
//
// Fragment-bearing keyboards (baseIr.raw.length > 0) are now fully supported:
// emit() uses a position-faithful path for these keyboards that interleaves
// stores, rules, and fragments in their original source order and preserves ALL
// user stores (not just those referenced by typed rules). The prior gate that
// skipped re-emit for fragment-bearing keyboards has been removed.

import type { KeyboardIR, VirtualFS } from "@keyboard-studio/contracts";
import { emit } from "../codec/emit.js";
import { carveFilterIr } from "./carveFilterIr.js";

/**
 * Options bag for {@link applyCarveToVfs}.
 *
 * - `forceEmit` — when `true`, the function proceeds to re-emit even when
 *   `deletedNodeIds` is empty. Use this when a preceding transform (e.g.
 *   `applyStoreSlotRemovals`) has already modified `baseIr` and the updated IR
 *   must be written into the VFS regardless of whether any whole-node deletions
 *   are present. The entry-group safety gate still applies.
 */
export interface ApplyCarveToVfsOpts {
  forceEmit?: boolean;
}

/**
 * Project carve deletions onto the VFS without mutating `baseIr`.
 *
 * Reads the .kmn path (`source/<keyboardId>.kmn`) from the VFS, replaces it
 * with the emit of a deletion-filtered copy of `baseIr`, then returns any
 * warnings produced.
 *
 * The re-emit is skipped (with a warning) only when the deletion set would
 * remove the entry group (the first non-readonly group), which would silently
 * retarget `begin Unicode > use(...)`.
 *
 * Fragment-bearing keyboards (`baseIr.raw.length > 0`) are fully supported:
 * emit() uses a position-faithful path that interleaves stores, rules, and
 * fragments in their original source order and preserves ALL user stores.
 *
 * @param vfs            In-memory virtual filesystem. Written in-place.
 * @param keyboardId     Keyboard identifier (determines the .kmn VFS path).
 * @param baseIr         Source-of-truth IR (never mutated).
 * @param deletedNodeIds Set of nodeIds the author has marked for deletion.
 * @param opts           Optional settings; see {@link ApplyCarveToVfsOpts}.
 * @returns Warnings produced during projection (empty when all is well).
 */
export function applyCarveToVfs(
  vfs: VirtualFS,
  keyboardId: string,
  baseIr: KeyboardIR,
  deletedNodeIds: ReadonlySet<string>,
  opts?: ApplyCarveToVfsOpts,
): { warnings: string[] } {
  const warnings: string[] = [];
  const forceEmit = opts?.forceEmit === true;

  if (deletedNodeIds.size === 0 && !forceEmit) {
    // Nothing to filter — skip the re-emit. The VFS already holds the base .kmn
    // from the fetch step. This is the common path in the early-survey stages.
    return { warnings };
  }

  // Safety gate: entry-group deletion guard.
  // emit() picks the first non-readonly group as the `begin Unicode > use(...)`
  // target. Deleting it would silently retarget the begin directive.
  const entryGroup = baseIr.groups.find((g) => !g.readonly);
  if (entryGroup !== undefined && deletedNodeIds.has(entryGroup.nodeId)) {
    warnings.push(
      `[carve-project] carve re-emit skipped: deletion set includes the entry group ` +
        `"${entryGroup.name}" (nodeId: ${entryGroup.nodeId}); removing it would ` +
        "silently retarget begin Unicode > use(...). Remove the deletion or change " +
        "the entry group first.",
    );
    return { warnings };
  }

  const kmnPath = `source/${keyboardId}.kmn`;

  // Build a new IR that excludes deleted nodes. Shallow copy at each level so
  // baseIr is never mutated (D3: immutable working-copy layers). The deletion
  // filter is the shared pure producer carveFilterIr, so this VFS path and the
  // spec-014 mutate() seam derive byte-identical filtered IRs.
  const filteredIr: KeyboardIR = carveFilterIr(baseIr, deletedNodeIds);

  let emitted: string;
  try {
    emitted = emit(filteredIr);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`[carve-project] emit failed: ${msg}`);
    return { warnings };
  }

  vfs.set(kmnPath, emitted, false); // isBinary = false

  return { warnings };
}

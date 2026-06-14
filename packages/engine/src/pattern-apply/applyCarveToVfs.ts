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
// Safety gate: emit() is lossy (~415 round-trip-divergence keyboards), so
// re-emitting an IR with opaque/raw fragments can alter non-deleted rules.
// Re-emit is therefore gated on:
//   1. baseIr.raw.length === 0 (no opaque fragments that would be lossily
//      serialised — the full text-splice fix is deferred to a follow-up).
//   2. The set of deleted nodes must not remove the entry group — the first
//      non-readonly group that emit() picks for `begin Unicode > use(...)`.
//      Removing it would silently retarget the begin directive.
// When either condition fails, the carve step is skipped and a warning is
// returned; the VFS is left unchanged.

import type { KeyboardIR, VirtualFS } from "@keyboard-studio/contracts";
import { emit } from "../codec/emit.js";

/**
 * Project carve deletions onto the VFS without mutating `baseIr`.
 *
 * Reads the .kmn path (`source/<keyboardId>.kmn`) from the VFS, replaces it
 * with the emit of a deletion-filtered copy of `baseIr`, then returns any
 * warnings produced.
 *
 * The re-emit is skipped (with a warning) when the IR is not safe to re-emit:
 * - The base IR contains opaque/raw fragments (`baseIr.raw.length > 0`). The
 *   codec's emit() is lossy for these keyboards; the proper text-splice fix is
 *   tracked separately. Gate: `baseIr.raw.length === 0` only (no importStatus
 *   field exists on KeyboardIR today — add here when one is introduced).
 * - The deletion set would remove the entry group (the first non-readonly
 *   group), which would silently retarget `begin Unicode > use(...)`.
 *
 * @param vfs           In-memory virtual filesystem. Written in-place.
 * @param keyboardId    Keyboard identifier (determines the .kmn VFS path).
 * @param baseIr        Source-of-truth IR (never mutated).
 * @param deletedNodeIds Set of nodeIds the author has marked for deletion.
 * @returns Warnings produced during projection (empty when all is well).
 */
export function applyCarveToVfs(
  vfs: VirtualFS,
  keyboardId: string,
  baseIr: KeyboardIR,
  deletedNodeIds: ReadonlySet<string>,
): { warnings: string[] } {
  const warnings: string[] = [];

  if (deletedNodeIds.size === 0) {
    // Nothing to filter — skip the re-emit. The VFS already holds the base .kmn
    // from the fetch step. This is the common path in the early-survey stages.
    return { warnings };
  }

  // Safety gate 1: opaque/raw fragments present — re-emit is lossy.
  // The text-splice fix (which avoids re-emitting the whole file) is tracked
  // separately. Until then, skip the carve projection for these keyboards.
  if (baseIr.raw.length > 0) {
    warnings.push(
      "[carve-project] carve re-emit skipped: IR contains opaque/raw fragments " +
        `(${baseIr.raw.length} fragment(s)); deletions are not projected to avoid ` +
        "lossy round-trip. Text-splice fix is tracked separately.",
    );
    return { warnings };
  }

  // Safety gate 2: entry-group deletion guard.
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
  // baseIr is never mutated (D3: immutable working-copy layers).
  const filteredIr: KeyboardIR = {
    ...baseIr,
    // Filter deleted stores.
    stores: baseIr.stores.filter((s) => !deletedNodeIds.has(s.nodeId)),
    // Filter deleted groups; within surviving groups, filter deleted rules.
    groups: baseIr.groups
      .filter((g) => !deletedNodeIds.has(g.nodeId))
      .map((g) => {
        const filteredRules = g.rules.filter((r) => !deletedNodeIds.has(r.nodeId));
        // Only allocate a new group object when rules actually changed.
        if (filteredRules.length === g.rules.length) return g;
        return { ...g, rules: filteredRules };
      }),
    // Raw fragments array is always empty here (gate 1 ensures raw.length === 0).
    raw: [],
    // Comments are not individually deleteable via carve; pass through.
    comments: baseIr.comments,
  };

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

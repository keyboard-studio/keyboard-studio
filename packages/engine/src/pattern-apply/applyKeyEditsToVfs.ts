/**
 * applyKeyEditsToVfs — VFS projection step for the key-level touch-layout
 * edit overlay (spec 058 FR-031…FR-034, FR-036a…FR-036g; step 1.7 of
 * `projectWorkingCopyVfs`; contracts/key-edit-overlay.md §6.1 "The layout
 * pass — new step 1.7").
 *
 * Splices the committed `KeyEditOperation[]` overlay directly onto the
 * `.keyman-touch-layout` VFS entry via the Case B raw-JSON applier
 * (`applyKeyEditsToRawJson`) — never round-tripped through `TouchLayoutIR`,
 * per spec 035's R9. Mirrors `applyTouchKeycapRemovalsToVfs.ts`'s own
 * VFS-projection shape one layer up: the same path resolution
 * (`resolveOskAssetPaths`), the same no-op-when-empty/absent/invalid-JSON
 * gates, and the same change-detecting write (only `vfs.set` when the
 * serialized string actually changed — FR-033).
 *
 * Ops are sorted by `seq` before being handed to the applier, mirroring
 * `replayKeyEditOverlay`'s own ordering guarantee (§2 of the contract:
 * "ordered, not keyed") — an overlay array that was reconstructed
 * out of commit order (e.g. after an undo splices an entry out and back)
 * must not silently resolve against the wrong key.
 *
 * The RULE half of a committed operation (e.g. a `rename`'s vkey-binding
 * fix-up) is a SEPARATE pass over the `.kmn`, not this module's concern —
 * see `projectWorkingCopyVfs.ts`'s own step immediately after this one
 * (contracts/key-edit-overlay.md §6.2, R10.2: the working IR is never
 * emitted into the artifact, so the rule half needs its own re-emit path).
 */

import type { VirtualFS } from "@keyboard-studio/contracts";
import { resolveOskAssetPaths, readVfsText } from "./oskAssetShared.js";
import { applyKeyEditsToRawJson, type ApplyKeyEditsToRawJsonResult } from "./applyKeyEditsToRawJson.js";
import type { KeyEditOperation } from "./keyEditOps.js";

export interface ApplyKeyEditsToVfsResult {
  warnings: string[];
}

/**
 * Apply `ops` (in commit order) to the `.keyman-touch-layout` VFS entry
 * in place. No-op (no warnings) when `ops` is empty, the file is absent or
 * binary — a touch-only-free keyboard, or a keyboard shipping no touch
 * layout at all, must not be treated as an error.
 */
export function applyKeyEditsToVfs(
  vfs: VirtualFS,
  keyboardId: string,
  ops: readonly KeyEditOperation[],
): ApplyKeyEditsToVfsResult {
  const warnings: string[] = [];
  if (ops.length === 0) return { warnings };

  const { touchPath } = resolveOskAssetPaths(vfs, keyboardId);
  const raw = readVfsText(vfs, touchPath);
  if (raw === undefined) return { warnings };

  const orderedOps = [...ops].sort((a, b) => a.seq - b.seq);

  let result: ApplyKeyEditsToRawJsonResult;
  try {
    result = applyKeyEditsToRawJson(raw, orderedOps);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(
      `[applyKeyEdits] .keyman-touch-layout at "${touchPath}" is not valid JSON — key edits not applied: ${msg}`,
    );
    return { warnings };
  }

  if (result.json !== raw) {
    vfs.set(touchPath, result.json, false);
  }
  warnings.push(...result.warnings);
  return { warnings };
}

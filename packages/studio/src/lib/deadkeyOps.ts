// deadkeyOps — the spec-083 deadkey lifecycle overlay.
//
// Mirrors the spec-063 key-edit overlay's structure (contracts doc
// key-edit-overlay.md; engine's pattern-apply/keyEditOps.ts):
//
// - the Deadkeys step records every committed lifecycle mutation as a
//   DeadkeyOperation in the working-copy store (`deadkeyOverlay.ops`,
//   commit order, via `commitDeadkeyOp`);
// - `projectWorkingCopyVfs` replays the log onto the projected .kmn at its
//   deadkey step via `applyDeadkeyOpsToVfs`, so working-IR deadkey edits
//   reach the preview/download artifacts.
//
// HOME DECISION (documented per the Phase-4 brief): this module lives in
// packages/studio/src/lib — NOT in packages/engine next to keyEditOps.ts —
// because half the replay primitives (pair add/remove, author-name tokens,
// merge, repoint, duplicate repair, named-deadkey delete/retarget) are
// studio-owned helpers in editors/deadkey/deadkeyWrite.ts. Moving those
// into the engine would churn Phase-3's committed surface for no
// behavioural gain; the four entity mutations (define/rename/delete/
// retarget) are imported from @keyboard-studio/engine. If a later engine
// phase needs the overlay, the helpers move with it — the op shapes are
// engine-agnostic (plain data), so the move is a relocation, not a
// redesign.
//
// REPLAY CONTRACT (mirrors applyKeyEditsToVfs): never throws. Each op is
// applied defensively in commit order against the IR parsed from the
// projected .kmn; an op whose preconditions no longer hold (e.g. its

import type { KeyboardIR, VirtualFS } from "@keyboard-studio/contracts";
import { emitKmn, parseKmn } from "@keyboard-studio/engine";
import { readVfsText } from "./vfsText.ts";
import {
  applyDeadkeyOp,
  type DeadkeyOperation,
} from "../survey/deadkeys/deadkeyOps.ts";

// Spec 090 T033: the op type, the overlay/value shapes, the single-op
// applier, and the IR-level replay live in survey/deadkeys/deadkeyOps.ts
// (the survey feature home — gallery decision modules may import only
// survey/** and packages). Re-exported here so this file's existing
// consumers keep their import paths.
export type {
  DeadkeyOperation,
  DeadkeyOverlay,
  DeadkeysDefinedValue,
} from "../survey/deadkeys/deadkeyOps.ts";
export { applyDeadkeyOpsToIr } from "../survey/deadkeys/deadkeyOps.ts";
// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

export interface ApplyDeadkeyOpsResult {
  warnings: string[];
  /** True when at least one op changed the .kmn (it was re-emitted). */
  changed: boolean;
}

/**
 * Replay a committed deadkey op log onto the projected .kmn, in place.
 *
 * Mirrors `applyKeyEditsToVfs(vfs, keyboardId, keyEditOps)`: parses
 * `source/<keyboardId>.kmn`, applies each op's mutation to the IR, and
 * re-emits only when something changed. Never throws — every failure mode
 * (missing file, unparsable .kmn, op precondition gone) becomes a warning.
 */
export function applyDeadkeyOpsToVfs(
  vfs: VirtualFS,
  keyboardId: string,
  ops: readonly DeadkeyOperation[],
): ApplyDeadkeyOpsResult {
  const warnings: string[] = [];
  if (ops.length === 0) return { warnings, changed: false };

  const kmnPath = `source/${keyboardId}.kmn`;
  const kmnText = readVfsText(vfs, kmnPath);
  if (kmnText === undefined) {
    warnings.push(
      `[project-working-copy] deadkey overlay skipped: ${kmnPath} not in VFS`,
    );
    return { warnings, changed: false };
  }

  let ir: KeyboardIR;
  try {
    ir = parseKmn(kmnText, keyboardId).ir;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(
      `[project-working-copy] deadkey overlay skipped: .kmn parse failed: ${msg}`,
    );
    return { warnings, changed: false };
  }

  let changed = false;
  ops.forEach((op, index) => {
    const tag = `[deadkey-overlay] op #${index} (${op.kind})`;
    try {
      const next = applyDeadkeyOp(ir, op);
      if (next !== ir) {
        ir = next;
        changed = true;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`${tag} skipped: ${msg}`);
    }
  });

  if (changed) {
    try {
      vfs.set(kmnPath, emitKmn(ir), false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(
        `[project-working-copy] deadkey overlay re-emit failed: ${msg}`,
      );
      return { warnings, changed: false };
    }
  }
  return { warnings, changed };
}

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
// deadkey was carved away upstream, or an id it needs is taken) is
// skipped with a warning — never a silent no-op, never a corrupt .kmn.

import type { KeyboardIR, VirtualFS } from "@keyboard-studio/contracts";
import { listDeadkeys } from "@keyboard-studio/contracts";
import {
  defineDeadkey,
  deleteDeadkey,
  emitKmn,
  parseKmn,
  renameDeadkey,
  retargetDeadkey,
} from "@keyboard-studio/engine";
import {
  deleteNamedDeadkey,
  retargetNamedDeadkey,
  withAddedDeadkeyPair,
  withDeadkeyAuthorName,
  withMergedDeadkeyPairs,
  withRemovedDeadkeyPair,
  withRepairedDuplicateTriggerIds,
  withRepointedDeadkeyRefs,
} from "../editors/deadkey/deadkeyWrite.ts";
import { readVfsText } from "./vfsText.ts";

// ---------------------------------------------------------------------------
// Operation log
// ---------------------------------------------------------------------------

/**
 * One committed deadkey lifecycle mutation, as recorded by the Deadkeys
 * step. Plain data — no IR references — so the log survives independently
 * of the working IR it was validated against.
 *
 * The studio-owned ops (add-pair, remove-pair, set-name, merge-pairs,
 * repoint, repair-duplicate-ids, delete-named, retarget-named) mirror the
 * commit sites in DeadkeyDetailEditor / DeadkeyDefineForm /
 * DeadkeyInventory one-to-one: every path that calls onCommitIr with a
 * deadkey-derived IR records the op that produced it.
 */
export type DeadkeyOperation =
  /** defineDeadkey: trigger rule + fan-out + escape + the two empty stores. */
  | {
      kind: "define";
      triggerKey: string;
      id: number;
      accentChar: string;
      authorName?: string;
    }
  /** renameDeadkey: atomic id rewrite. */
  | { kind: "rename"; from: number; to: number }
  /** deleteDeadkey: whole-entity removal. */
  | { kind: "delete"; id: number }
  /** retargetDeadkey: trigger-key move, id untouched. */
  | { kind: "retarget"; id: number; newTriggerKey: string }
  /** withAddedDeadkeyPair: one base→accented pair appended to the fan-out stores. */
  | { kind: "add-pair"; id: number; base: string; accented: string }
  /** withRemovedDeadkeyPair: the pair at the zipped index removed. */
  | { kind: "remove-pair"; id: number; index: number }
  /** withDeadkeyAuthorName: the @deadkey:<hex> name=<name> comment token. */
  | { kind: "set-name"; id: number; name: string | undefined }
  /** withMergedDeadkeyPairs: fromId's pairs appended onto toId's stores. */
  | { kind: "merge-pairs"; fromId: number; toId: number }
  /**
   * withRepointedDeadkeyRefs: every listed referrer rewritten fromId→toId.
   * The referrer strings are recorded so replay rewrites exactly what the
   * editor rewrote — never a fresh scan that could over- or under-match.
   */
  | { kind: "repoint"; fromId: number; toId: number; referrers: readonly string[] }
  /** withRepairedDuplicateTriggerIds: the "dead0" duplicate-id repair. */
  | { kind: "repair-duplicate-ids" }
  /** deleteNamedDeadkey: raw-fragment removal for dk(name). */
  | { kind: "delete-named"; name: string }
  /** retargetNamedDeadkey: trigger-token rewrite for dk(name). */
  | {
      kind: "retarget-named";
      name: string;
      newTrigger: { vkey: string } | { char: string };
    };

/** The ordered, append-only deadkey op log (mirrors KeyEditOverlay). */
export interface DeadkeyOverlay {
  ops: DeadkeyOperation[];
}

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

/**
 * Apply one op to `ir`. Returns the (possibly new) IR, or the input IR
 * unchanged when the op is a no-op. Throws on any precondition failure —
 * the caller converts to a warning.
 */
function applyDeadkeyOp(ir: KeyboardIR, op: DeadkeyOperation): KeyboardIR {
  switch (op.kind) {
    case "define": {
      const result = defineDeadkey(ir, {
        triggerKey: op.triggerKey,
        id: op.id,
        accentChar: op.accentChar,
        ...(op.authorName !== undefined ? { authorName: op.authorName } : {}),
      });
      if (!result.ok) {
        throw new Error(
          `define refused: ${result.conflicts.map((c) => c.message).join(" ")}`,
        );
      }
      return result.ir;
    }
    case "rename": {
      assertDeadkeyPresent(ir, op.from, "rename");
      const result = renameDeadkey(ir, { from: op.from, to: op.to });
      if (!result.ok) {
        throw new Error(
          `rename refused: ${result.conflicts.map((c) => c.message).join(" ")}`,
        );
      }
      return result.ir;
    }
    case "delete": {
      if (!hasDeadkey(ir, op.id)) {
        // Already absent upstream (e.g. carved away at step 1): nothing to
        // do, and succeeding loudly beats failing on a satisfied goal.
        return ir;
      }
      const result = deleteDeadkey(ir, { id: op.id });
      if (!result.ok) {
        throw new Error(
          `delete refused: ${result.conflicts.map((c) => c.message).join(" ")}`,
        );
      }
      return result.ir;
    }
    case "retarget": {
      assertDeadkeyPresent(ir, op.id, "retarget");
      const result = retargetDeadkey(ir, {
        id: op.id,
        newTriggerKey: op.newTriggerKey,
      });
      if (!result.ok) {
        throw new Error(
          `retarget refused: ${result.conflicts.map((c) => c.message).join(" ")}`,
        );
      }
      return result.ir;
    }
    case "add-pair": {
      const stores = fanoutStores(ir, op.id, "add-pair");
      return withAddedDeadkeyPair(ir, stores.bases, stores.outputs, op.base, op.accented);
    }
    case "remove-pair": {
      const stores = fanoutStores(ir, op.id, "remove-pair");
      return withRemovedDeadkeyPair(ir, stores.bases, stores.outputs, op.index);
    }
    case "set-name": {
      assertDeadkeyPresent(ir, op.id, "set-name");
      return withDeadkeyAuthorName(ir, op.id, op.name);
    }
    case "merge-pairs": {
      return withMergedDeadkeyPairs(ir, op.fromId, op.toId);
    }
    case "repoint": {
      const { ir: next, unparsed } = withRepointedDeadkeyRefs(
        ir,
        op.fromId,
        op.toId,
        op.referrers,
      );
      if (unparsed.length > 0) {
        // The editor refuses the whole repoint when anything is unparsed —
        // replay mirrors that refusal rather than half-repointing.
        throw new Error(
          `repoint refused: ${unparsed.length} unparsed referrer(s): ${unparsed.join("; ")}`,
        );
      }
      return next;
    }
    case "repair-duplicate-ids": {
      return withRepairedDuplicateTriggerIds(ir);
    }
    case "delete-named": {
      const result = deleteNamedDeadkey(ir, op.name);
      if (!result.ok) {
        throw new Error(`delete-named refused: ${result.referrers.join("; ")}`);
      }
      return result.ir;
    }
    case "retarget-named": {
      const result = retargetNamedDeadkey(ir, op.name, op.newTrigger);
      if (!result.ok) {
        throw new Error(`retarget-named refused: ${result.error}`);
      }
      return result.ir;
    }
  }
}

function hasDeadkey(ir: KeyboardIR, id: number): boolean {
  return listDeadkeys(ir).some((d) => d.id === id);
}

function assertDeadkeyPresent(ir: KeyboardIR, id: number, opKind: string): void {
  if (!hasDeadkey(ir, id)) {
    throw new Error(
      `${opKind}: dk(${id.toString(16)}) not present in the projected IR — ` +
        `it may have been removed upstream (e.g. carved away). Skipping rather than guessing.`,
    );
  }
}

/** Resolve a deadkey's fan-out store names by id; throws when unresolvable. */
function fanoutStores(
  ir: KeyboardIR,
  id: number,
  opKind: string,
): { bases: string; outputs: string } {
  const found = listDeadkeys(ir).find((d) => d.id === id);
  if (!found) {
    throw new Error(
      `${opKind}: dk(${id.toString(16)}) not present in the projected IR — skipping.`,
    );
  }
  if (!found.baseStore || !found.outputStore) {
    throw new Error(
      `${opKind}: dk(${id.toString(16)}) has no recognizable fan-out stores — skipping.`,
    );
  }
  return { bases: found.baseStore, outputs: found.outputStore };
}

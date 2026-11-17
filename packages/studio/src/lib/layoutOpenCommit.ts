// layoutOpenCommit -- a Layout-tab edit on a keyboard opened for update (spec 111
// FR-041, FR-042, FR-045; constitution Article III).
//
// On Open the file is the truth: the edit is worked out on the file's own parse
// (`startIr`), written into the source through the apply seam when the author
// confirms it, and undone with the footer's Open undo (one record per confirm).
// The `kmn-edits` / `deadkeys-defined` decision is only the record: an entry is
// made once the edit is in the file (now when it is placed precisely, on
// agreement when the author is asked first), never for a decline or a refusal.
// Copy never comes through here.
//
// One confirm is one change, even when it touches several rules (a case partner,
// a displaced character, a changed deadkey combination): the ops are applied one
// after another to the file's parse and the result is written as one `model`
// change scoped to the groups (and, for deadkeys, stores and raw) it touches.
// No timers.

import type { KeyboardIR, KmnEdit } from "@keyboard-studio/contracts";
import { isLayoutOperation } from "@keyboard-studio/contracts";
import { devLog } from "@keyboard-studio/contracts/dev-log";
import { applyLayoutOp, attributeLayer, clearKeyLive } from "@keyboard-studio/engine";
import { applyMutatePatch } from "../steps/mutateApply.ts";
import { DEADKEY_WRITES, LAYOUT_WRITES } from "../steps/editorMutate.ts";
import type { CommitKmnEditResult, KmnEditInput, KmnEditRefusal } from "./kmnEditTypes.ts";
import type { OpenChange } from "./openApply/types.ts";
import { applyThroughOpenSeam, handOverToOpenApplyHost } from "./openApplyNotifier.ts";
import { applyDeadkeyOp, type DeadkeyOperation } from "./deadkeyOps.ts";

/** True when the static attribution says the target slot cannot be edited (FR-025). */
export function slotIsReadOnly(ir: KeyboardIR, entry: KmnEdit): boolean {
  if (entry.op !== "set-key" && entry.op !== "clear-key") return false;
  const cell = attributeLayer(ir, entry.layer, [entry.vkey])[0];
  if (cell === undefined || cell.frame) return true;
  return cell.plain !== null && !cell.plain.editable;
}

type Computed = { change: OpenChange } | { refusal: KmnEditRefusal };

/**
 * Write one Layout-tab change into the file. `compute` makes the change from the
 * working copy as it stands when it runs (it runs again after the author agrees);
 * `record` makes the decision entry and returns the sequence numbers it gave.
 */
function commitOnOpen(
  compute: () => Computed,
  record: () => number[],
  opts: { recordOnUnchanged: boolean; onAppliedLater: (() => void) | undefined },
): CommitKmnEditResult {
  const first = compute();
  if ("refusal" in first) return { ok: false, reason: first.refusal };
  const result = applyThroughOpenSeam(first.change);
  if (result.status === "applied") return { ok: true, seqs: record() };
  if (result.status === "unchanged") {
    // The file already holds the change, so there is nothing to record; except for an entry that
    // is a record only (a declined case partner), whose whole effect is the entry.
    return { ok: true, seqs: opts.recordOnUnchanged ? record() : [] };
  }
  if (result.status === "needs-consent") {
    const handed = handOverToOpenApplyHost({
      build: () => {
        const again = compute();
        return "change" in again ? again.change : null;
      },
      onNotApplied: () => {},
      onApplied: () => {
        record();
        opts.onAppliedLater?.();
      },
    });
    if (handed) return { ok: true, seqs: [], pending: true };
    devLog.warn(`[layout-open] a Layout-tab change was not written: ${result.files.join(", ")} needs the author's agreement`);
    return { ok: false, reason: "no-host" };
  }
  return { ok: false, reason: "refused" };
}

/** Commit Layout-tab `commitKmnEdit` ops on Open: the file's parse takes each op in turn. */
export function commitKmnEditOnOpen(args: {
  startIr: () => KeyboardIR | null;
  inputs: readonly KmnEditInput[];
  /** Appends `entries` (seq and time assigned here) to the `kmn-edits` record. */
  record: (inputs: readonly KmnEditInput[]) => number[];
  /** Runs when a change handed to the host for agreement has been written. */
  onAppliedLater?: () => void;
}): CommitKmnEditResult {
  const { inputs } = args;
  const compute = (): Computed => {
    const start = args.startIr();
    if (start === null) return { refusal: "no-working-copy" };
    let ir = start;
    const added: KmnEdit[] = [];
    let seq = 0;
    for (const input of inputs) {
      const entry = { ...input, seq: ++seq, at: 0 } as KmnEdit;
      if (slotIsReadOnly(ir, entry)) return { refusal: "read-only" };
      try {
        if (!isLayoutOperation(entry)) return { refusal: "refused" };
        const result = entry.op === "clear-key" ? clearKeyLive(ir, entry, start, added) : applyLayoutOp(ir, entry);
        ir = applyMutatePatch(ir, { groups: result.ir.groups }, LAYOUT_WRITES);
      } catch (err) {
        devLog.warn(`[layout-open] ${entry.op} refused: ${err instanceof Error ? err.message : String(err)}`);
        return { refusal: "refused" };
      }
      added.push(entry);
    }
    return { change: { kind: "model", nextIr: ir, writes: LAYOUT_WRITES, label: "Layout tab change", labelKey: "layout-edit" } };
  };
  return commitOnOpen(compute, () => args.record(inputs), {
    recordOnUnchanged: inputs.some((i) => i.op === "decline-case-partner"),
    onAppliedLater: args.onAppliedLater,
  });
}

/** Commit Layout-tab deadkey lifecycle ops on Open: one confirm, one change. */
export function commitLayoutDeadkeyOpOnOpen(args: {
  startIr: () => KeyboardIR | null;
  ops: readonly DeadkeyOperation[];
  /** Appends `ops` to the deadkey overlay and the `deadkeys-defined` record. */
  record: (ops: readonly DeadkeyOperation[]) => void;
  /** Runs when a change handed to the host for agreement has been written. */
  onAppliedLater?: () => void;
}): CommitKmnEditResult {
  const { ops } = args;
  const compute = (): Computed => {
    const start = args.startIr();
    if (start === null) return { refusal: "no-working-copy" };
    let ir = start;
    try {
      for (const op of ops) {
        const next = applyDeadkeyOp(ir, op);
        ir = applyMutatePatch(ir, { groups: next.groups, stores: next.stores, raw: next.raw }, DEADKEY_WRITES);
      }
    } catch (err) {
      devLog.warn(`[layout-open] a deadkey op was refused: ${err instanceof Error ? err.message : String(err)}`);
      return { refusal: "refused" };
    }
    return { change: { kind: "model", nextIr: ir, writes: DEADKEY_WRITES, label: "Layout tab change", labelKey: "layout-edit" } };
  };
  return commitOnOpen(
    compute,
    () => {
      args.record(ops);
      return [];
    },
    // A deadkey op the file already reflects has nothing to record.
    { recordOnUnchanged: false, onAppliedLater: args.onAppliedLater },
  );
}

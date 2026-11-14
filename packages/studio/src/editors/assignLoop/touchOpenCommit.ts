// touchOpenCommit -- a key-grid / builder edit on a keyboard opened for update
// (spec 111 FR-041, FR-044, FR-045; phase 16).
//
// On Open the touch FILE is the truth: the key grid, the builder and the preview
// all read it, and an edit is written into it through the apply seam as one
// `touch` change (only the affected lines change), undone with the footer's Open
// undo. The key-edit overlay is only a RECORD: an op is appended once it is in
// the file (now when it is placed precisely, on agreement when the author is
// asked first), never for a decline or a refusal, and nothing replays it.
//
// One author action is one change: a family fan-out, a bulk edit, a template
// apply or a tray drop commits several ops, so those callers wrap their loop in
// `groupTouchCommitsOnOpen`; the ops it collects are written as ONE change.
//
// Layer add (T087c): none of the key-edit ops adds a layer (`moveToLayer` /
// `copyToLayer` require an existing target), so there is no layer-add path to
// write here. An op the layout cannot place leaves the file unchanged and says
// so in the dev log; it is never turned into a partial write. No timers.

import type { KeyboardIR } from "@keyboard-studio/contracts";
import { devLog } from "@keyboard-studio/contracts/dev-log";
import type { KeyEditOperation, RenameKeyOp } from "@keyboard-studio/engine";
import { useWorkingCopyStore, type PendingKeyEditOperation } from "../../stores/workingCopyStore.ts";
import { LAYOUT_WRITES } from "../../steps/editorMutate.ts";
import type { OpenChange } from "../../lib/openApply/types.ts";
import { applyThroughOpenSeam, handOverToOpenApplyHost } from "../../lib/openApplyNotifier.ts";

export type TouchOpenOutcome =
  /** In the file now. */
  | "applied"
  /** The file already holds it (nothing written, nothing recorded). */
  | "unchanged"
  /** The author is being asked first; the record follows an agreement. */
  | "pending"
  /** Not written (a notice is shown by the host when one is mounted). */
  | "failed";

export interface TouchOpenSubmission {
  op: PendingKeyEditOperation;
  /** The `.kmn` half an op carries (AssignPanel's synthesized rules): the working IR after them. */
  rulesIr?: KeyboardIR | undefined;
  /** Runs once the op is in the file (now, or after the author agreed). */
  onApplied?: (() => void) | undefined;
}

interface Built {
  change: Extract<OpenChange, { kind: "touch" }>;
  ops: KeyEditOperation[];
}

/** The change for `subs`, from the overlay as it stands now (seqs continue it). */
function build(subs: readonly TouchOpenSubmission[], label: string): Built {
  const base = useWorkingCopyStore.getState().keyEditOverlay.ops.length;
  const ops = subs.map((s, i) => ({ ...s.op, seq: base + i }) as KeyEditOperation);
  const renames = ops.filter((o): o is RenameKeyOp => o.kind === "rename");
  const rulesIr = [...subs].reverse().find((s) => s.rulesIr !== undefined)?.rulesIr;
  const change: Built["change"] = {
    kind: "touch",
    edit: { ops },
    ...(renames.length > 0 ? { renames } : {}),
    ...(rulesIr !== undefined ? { rules: { nextIr: rulesIr, writes: LAYOUT_WRITES } } : {}),
    label,
  };
  return { change, ops };
}

/** The record only: the ops join the overlay (no undo-stack entry, nothing replays them on Open). */
function recordOps(ops: readonly KeyEditOperation[]): void {
  if (ops.length === 0) return;
  useWorkingCopyStore.setState((s) => ({ keyEditOverlay: { ops: [...s.keyEditOverlay.ops, ...ops] } }));
}

function commitNow(subs: readonly TouchOpenSubmission[], label: string): TouchOpenOutcome {
  if (subs.length === 0) return "unchanged";
  const first = build(subs, label);
  const done = (ops: readonly KeyEditOperation[]): void => {
    recordOps(ops);
    for (const s of subs) s.onApplied?.();
  };
  const result = applyThroughOpenSeam(first.change);
  if (result.status === "applied") {
    done(first.ops);
    return "applied";
  }
  if (result.status === "unchanged") {
    devLog.warn("[touch-open] a touch edit left the file as it is (already there, or no key to place it on)");
    return "unchanged";
  }
  if (result.status === "needs-consent" || result.status === "failed") {
    let latest = first.ops;
    const handed = handOverToOpenApplyHost({
      build: () => {
        const again = build(subs, label);
        latest = again.ops;
        return again.change;
      },
      onNotApplied: () => {},
      onApplied: () => done(latest),
    });
    if (handed) return result.status === "needs-consent" ? "pending" : "failed";
    devLog.warn("[touch-open] a touch edit was not written: it needs the author's agreement or could not be applied");
  }
  return "failed";
}

/**
 * Write a rules-only change (a mint-and-rule repair) into the `.kmn` on Open. The
 * working IR is not set here: the seam is its only writer. Returns the outcome.
 */
export function installRulesOnOpen(nextIr: KeyboardIR, label: string, onApplied?: () => void): TouchOpenOutcome {
  const change: OpenChange = { kind: "model", nextIr, writes: LAYOUT_WRITES, label };
  const result = applyThroughOpenSeam(change);
  if (result.status === "applied" || result.status === "unchanged") {
    onApplied?.();
    return result.status;
  }
  const handed = handOverToOpenApplyHost({ build: () => change, onNotApplied: () => {}, ...(onApplied !== undefined ? { onApplied } : {}) });
  if (handed && result.status === "needs-consent") return "pending";
  if (!handed) devLog.warn("[touch-open] a rules change was not written: it needs the author's agreement or could not be applied");
  return "failed";
}

let scope: TouchOpenSubmission[] | null = null;

/**
 * Write one key-grid op into the file (as its own change), or, inside
 * `groupTouchCommitsOnOpen`, queue it for the group's one change (it reports
 * "pending" until the group is written).
 */
export function commitTouchOpOnOpen(sub: TouchOpenSubmission, label: string): TouchOpenOutcome {
  if (scope !== null) {
    scope.push(sub);
    return "pending";
  }
  return commitNow([sub], label);
}

/**
 * Everything `run` commits through `commitTouchOpOnOpen` is one change: one write,
 * one undo record. Returns the group's outcome ("failed" is also shown to the
 * author by the host's notice, and logged when no host is mounted).
 *
 * `run` must be synchronous: an `await` inside it escapes the group (the scope is
 * closed when `run` returns). Within a group the ops are checked by the callers'
 * guards against the layout as it was when the group began, not against the
 * group's earlier ops (an add followed by a set of the new key is written
 * correctly, because the writer applies the ops in order on the file).
 */
export function groupTouchCommitsOnOpen(run: () => void, label: string): TouchOpenOutcome {
  if (scope !== null) {
    run();
    return "pending";
  }
  const subs: TouchOpenSubmission[] = [];
  scope = subs;
  try {
    run();
  } finally {
    scope = null;
  }
  return commitNow(subs, label);
}

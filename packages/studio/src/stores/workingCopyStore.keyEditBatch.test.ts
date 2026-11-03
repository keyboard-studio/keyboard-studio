// Unit tests for the Code tab's batch undo integration
// (commitKeyEditBatch / undoKeyEditBatch / undoDelete's 'kb' branch —
// workingCopyStore.ts; TIKE touch-builder port, Q2 ruling: one Apply = one
// undo step).
//
// The global test setup resets every zustand store exposing `reset()`
// before each test, so each case starts from an empty overlay and stack.

import { describe, expect, it } from "vitest";
import {
  useWorkingCopyStore,
  type PendingKeyEditOperation,
} from "./workingCopyStore.ts";

const SET_A: PendingKeyEditOperation = {
  address: "phone:default:K_A",
  kind: "set",
  fields: { text: "A" },
};
const SET_B: PendingKeyEditOperation = {
  address: "phone:default:K_B",
  kind: "set",
  fields: { text: "B" },
};
const SET_C: PendingKeyEditOperation = {
  address: "phone:default:K_C",
  kind: "set",
  fields: { text: "C" },
};

function state() {
  return useWorkingCopyStore.getState();
}

describe("commitKeyEditBatch", () => {
  it("appends N ops with consecutive seqs and pushes ONE 'kb' entry", () => {
    state().commitKeyEditBatch([SET_A, SET_B]);

    const ops = state().keyEditOverlay.ops;
    expect(ops).toHaveLength(2);
    expect(ops[0]).toMatchObject({ ...SET_A, seq: 0 });
    expect(ops[1]).toMatchObject({ ...SET_B, seq: 1 });

    const stack = state().undoStack;
    expect(stack).toHaveLength(1);
    expect(stack[0]).toEqual({ k: "kb", seqs: [0, 1] });
  });

  it("continues seqs after existing ops", () => {
    state().commitKeyEdit(SET_A);
    state().commitKeyEditBatch([SET_B, SET_C]);

    expect(state().keyEditOverlay.ops.map((o) => o.seq)).toEqual([0, 1, 2]);
    expect(state().undoStack).toEqual([
      { k: "k", seq: 0 },
      { k: "kb", seqs: [1, 2] },
    ]);
  });

  it("is a no-op for an empty array (no ops, no entry)", () => {
    state().commitKeyEditBatch([]);
    expect(state().keyEditOverlay.ops).toHaveLength(0);
    expect(state().undoStack).toHaveLength(0);
  });
});

describe("undoDelete with a 'kb' entry", () => {
  it("pops all N tail ops in one undo step", () => {
    state().commitKeyEditBatch([SET_A, SET_B, SET_C]);
    state().undoDelete();

    expect(state().keyEditOverlay.ops).toHaveLength(0);
    expect(state().undoStack).toHaveLength(0);
  });

  it("keeps LIFO lock-step when single and batch entries interleave", () => {
    state().commitKeyEdit(SET_A); // seq 0, 'k'
    state().commitKeyEditBatch([SET_B, SET_C]); // seqs 1,2, 'kb'
    state().commitKeyEdit(SET_A); // seq 3, 'k'

    state().undoDelete(); // pops seq 3
    expect(state().keyEditOverlay.ops.map((o) => o.seq)).toEqual([0, 1, 2]);
    expect(state().undoStack).toEqual([
      { k: "k", seq: 0 },
      { k: "kb", seqs: [1, 2] },
    ]);

    state().undoDelete(); // pops the whole batch
    expect(state().keyEditOverlay.ops.map((o) => o.seq)).toEqual([0]);
    expect(state().undoStack).toEqual([{ k: "k", seq: 0 }]);

    state().undoDelete(); // pops seq 0
    expect(state().keyEditOverlay.ops).toHaveLength(0);
    expect(state().undoStack).toHaveLength(0);
  });

  it("refuses to pop when the entry's seqs no longer match the tail", () => {
    state().commitKeyEditBatch([SET_A, SET_B]);
    // Bypass undoDelete: pop one op directly, leaving the 'kb' entry
    // pointing at seqs [0, 1] while the tail is now just [0].
    state().undoKeyEdit();

    const before = state();
    state().undoDelete();

    // Refused: nothing changed.
    expect(state().keyEditOverlay.ops).toHaveLength(
      before.keyEditOverlay.ops.length,
    );
    expect(state().undoStack).toHaveLength(before.undoStack.length);
  });
});

describe("undoKeyEditBatch", () => {
  it("removes the most recent batch's ops by seq and its entry", () => {
    state().commitKeyEditBatch([SET_A, SET_B]);
    state().undoKeyEditBatch();

    expect(state().keyEditOverlay.ops).toHaveLength(0);
    expect(state().undoStack).toHaveLength(0);
  });

  it("leaves ops committed after the batch untouched", () => {
    state().commitKeyEditBatch([SET_A, SET_B]); // seqs 0,1
    state().commitKeyEdit(SET_C); // seq 2
    state().undoKeyEditBatch();

    expect(state().keyEditOverlay.ops.map((o) => o.seq)).toEqual([2]);
    expect(state().undoStack).toEqual([{ k: "k", seq: 2 }]);

    // The remaining entries still undo in lock-step.
    state().undoDelete();
    expect(state().keyEditOverlay.ops).toHaveLength(0);
    expect(state().undoStack).toHaveLength(0);
  });

  it("is a no-op when no batch entry is on the stack", () => {
    state().commitKeyEdit(SET_A);
    state().undoKeyEditBatch();
    expect(state().keyEditOverlay.ops).toHaveLength(1);
    expect(state().undoStack).toHaveLength(1);
  });
});

/**
 * Tests for `invertEffect` (spec 113 T025): for every op kind, inverting the
 * recorded effect restores the IR the edit started from.
 */
import { describe, it, expect } from "vitest";
import type { LayoutOperation } from "@keyboard-studio/contracts";
import { emit } from "../codec/emit.js";
import { applyLayoutOp } from "./applyLayoutOp.js";
import { clearKeyLive } from "./clearKeyLive.js";
import { invertEffect } from "./invertEffect.js";
import { parseKmn } from "./testKeyboard.js";

const meta = { seq: 1, at: 0 };

const ops: Array<[string, LayoutOperation]> = [
  ["set-key replacing two rules", { ...meta, op: "set-key", vkey: "K_A", layer: [], output: { kind: "text", text: "z" } }],
  ["set-key on a fresh slot", { ...meta, op: "set-key", vkey: "K_C", layer: [], output: { kind: "text", text: "c" } }],
  ["set-key with nul", { ...meta, op: "set-key", vkey: "K_B", layer: ["SHIFT"], output: { kind: "nul" } }],
  ["set-row replacing a deadkey row", {
    ...meta, op: "set-row", vkey: "K_A", layer: [], context: [{ kind: "deadkey", deadkeyId: "0001" }],
    becomes: [{ kind: "text", text: "z" }],
  }],
  ["set-row adding a literal row", {
    ...meta, op: "set-row", vkey: "K_A", layer: [], context: [{ kind: "text", text: "ab" }],
    becomes: { kind: "nul" },
  }],
  ["remove-row", { ...meta, op: "remove-row", vkey: "K_B", layer: [], context: [{ kind: "text", text: "q" }] }],
  ["decline-case-partner", { ...meta, op: "decline-case-partner", vkey: "K_A", layer: [], partner: "A" }],
  ["clear-key", { ...meta, op: "clear-key", vkey: "K_A", layer: [] }],
];

describe("invertEffect", () => {
  it.each(ops)("restores the original IR after %s", (_name, op) => {
    const ir = parseKmn();
    const before = emit(ir);
    const applied = applyLayoutOp(ir, op);
    const inverted = invertEffect(applied.ir, applied.effect);
    expect(emit(inverted)).toBe(before);
    expect(inverted.groups.map((g) => g.rules.map((r) => r.nodeId))).toEqual(
      ir.groups.map((g) => g.rules.map((r) => r.nodeId)),
    );
  });

  it("restores the IR after a live clear-key", () => {
    const start = parseKmn();
    const set = applyLayoutOp(start, { ...meta, op: "set-key", vkey: "K_A", layer: [], output: { kind: "text", text: "z" } });
    const clear = { seq: 2, at: 0, op: "clear-key", vkey: "K_A", layer: [] } as const;
    const cleared = clearKeyLive(set.ir, clear, start, [{ ...meta, op: "set-key", vkey: "K_A", layer: [], output: { kind: "text", text: "z" } }]);
    expect(emit(invertEffect(cleared.ir, cleared.effect))).toBe(emit(set.ir));
  });

  it("does not mutate the IR it is given", () => {
    const ir = parseKmn();
    const applied = applyLayoutOp(ir, ops[0]![1]);
    const snap = structuredClone(applied.ir);
    invertEffect(applied.ir, applied.effect);
    expect(applied.ir).toEqual(snap);
  });

  it("undoes a stack of edits in reverse order", () => {
    const ir = parseKmn();
    const first = applyLayoutOp(ir, ops[0]![1]);
    const second = applyLayoutOp(first.ir, { ...meta, seq: 2, op: "set-key", vkey: "K_A", layer: [], output: { kind: "text", text: "y" } });
    const back = invertEffect(invertEffect(second.ir, second.effect), first.effect);
    expect(emit(back)).toBe(emit(ir));
  });
});

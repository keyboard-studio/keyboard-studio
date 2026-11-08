/**
 * Tests for `replayKmnEdits` and the live `clearKeyLive` (spec 113 T023):
 * idempotence, later-wins, the clear-key normalising pre-pass, and live
 * clear-key == replay for the slot, with and without the in-memory history.
 */
import { describe, it, expect } from "vitest";
import type { KmnEdit } from "@keyboard-studio/contracts";
import { emit } from "../codec/emit.js";
import { applyLayoutOp } from "./applyLayoutOp.js";
import { clearKeyLive } from "./clearKeyLive.js";
import { normaliseKmnEdits, replayKmnEdits } from "./replayKmnEdits.js";
import { parseKmn, slotLines } from "./testKeyboard.js";
import { diffIR } from "../kmn-diff/diffIR.js";
import { applyIRChanges } from "../kmn-diff/applyIRChanges.js";
import { parse } from "../codec/parse.js";

let seq = 0;
const at = 0;
function setKey(vkey: string, text: string, layer: Array<"SHIFT"> = []): KmnEdit {
  return { seq: ++seq, at, op: "set-key", vkey, layer, output: { kind: "text", text } };
}
function clearKey(vkey: string, layer: Array<"SHIFT"> = []): KmnEdit {
  return { seq: ++seq, at, op: "clear-key", vkey, layer };
}

describe("replayKmnEdits", () => {
  it("a Layout-only log has no misses", () => {
    expect(replayKmnEdits(parseKmn(), [setKey("K_A", "z")]).misses).toEqual([]);
  });

  it("replaying the same entries on the same IR twice yields the same IR", () => {
    const ir = parseKmn();
    const entries = [
      setKey("K_A", "p"),
      setKey("K_B", "r"),
      { seq: ++seq, at, op: "remove-row", vkey: "K_B", layer: [], context: [{ kind: "text", text: "q" }] } as KmnEdit,
      setKey("K_A", "t", ["SHIFT"]),
    ];
    const a = replayKmnEdits(ir, entries).ir;
    const b = replayKmnEdits(ir, entries).ir;
    expect(emit(a)).toBe(emit(b));
    expect(a).toEqual(b);
    // And replaying over its own result converges on the same text.
    expect(emit(replayKmnEdits(a, entries).ir)).toBe(emit(a));
  });

  it("later entries on the same slot win", () => {
    const out = replayKmnEdits(parseKmn(), [setKey("K_A", "p"), setKey("K_A", "r")]).ir;
    expect(slotLines(out, "K_A", [])).toEqual(["+ [K_A] > U+0072"]);
  });

  it("does not mutate the input IR", () => {
    const ir = parseKmn();
    const before = emit(ir);
    replayKmnEdits(ir, [setKey("K_A", "z")]);
    expect(emit(ir)).toBe(before);
  });

  it("a clear-key drops the earlier set-keys for its slot (replay is not a plain reduce)", () => {
    const ir = parseKmn();
    const entries = [setKey("K_A", "p"), setKey("K_B", "r"), clearKey("K_A")];
    const out = replayKmnEdits(ir, entries).ir;
    // The slot is back to the starting rules, not "whatever a reduce leaves".
    expect(slotLines(out, "K_A", [])).toEqual(slotLines(ir, "K_A", []));
    expect(slotLines(out, "K_B", [])).toEqual(["+ [K_B] > U+0072"]);
    expect(normaliseKmnEdits(entries).map((e) => e.op)).toEqual(["set-key"]);
  });

  it("a clear-key only drops its own layer, and a set-key after it applies", () => {
    const ir = parseKmn();
    const entries = [setKey("K_A", "p"), setKey("K_A", "S", ["SHIFT"]), clearKey("K_A"), setKey("K_A", "n")];
    const out = replayKmnEdits(ir, entries).ir;
    expect(slotLines(out, "K_A", [])).toEqual(["+ [K_A] > U+006E"]);
    expect(slotLines(out, "K_A", ["SHIFT"])).toEqual(["+ [SHIFT K_A] > U+0053"]);
  });

  it("a clear-key with nothing earlier is harmless", () => {
    const ir = parseKmn();
    expect(emit(replayKmnEdits(ir, [clearKey("K_A")]).ir)).toBe(emit(ir));
  });
});

describe("clearKeyLive", () => {
  /** Apply entries live, one at a time, as the studio does. */
  function live(startIr: ReturnType<typeof parseKmn>, entries: KmnEdit[]) {
    let ir = startIr;
    const done: KmnEdit[] = [];
    for (const e of entries) {
      ir = e.op === "clear-key" ? clearKeyLive(ir, e, startIr, done).ir : applyLayoutOp(ir, e).ir;
      done.push(e);
    }
    return ir;
  }

  const cases: Array<[string, () => KmnEdit[]]> = [
    ["a single set-key then clear", () => [setKey("K_A", "p"), clearKey("K_A")]],
    ["repeated set-keys then clear", () => [setKey("K_A", "p"), setKey("K_A", "r"), clearKey("K_A")]],
    ["clear amid edits to other slots", () => [setKey("K_A", "p"), setKey("K_B", "r"), setKey("K_A", "S", ["SHIFT"]), clearKey("K_A")]],
    ["clear of a slot that had no original rule", () => [setKey("K_C", "c"), clearKey("K_C")]],
    ["clear, set again, clear again", () => [setKey("K_A", "p"), clearKey("K_A"), setKey("K_A", "r"), clearKey("K_A")]],
  ];

  it.each(cases)("restores the slot exactly as replay does: %s", (_name, make) => {
    const start = parseKmn();
    const entries = make();
    const replayed = replayKmnEdits(start, entries).ir;
    const liveIr = live(start, entries);
    for (const [vkey, layer] of [["K_A", []], ["K_A", ["SHIFT"]], ["K_B", []], ["K_C", []]] as const) {
      expect(slotLines(liveIr, vkey, layer)).toEqual(slotLines(replayed, vkey, layer));
    }
    expect(emit(liveIr)).toBe(emit(replayed));
  });

  it.each(cases)("is the same after a reload from the starting point only: %s", (_name, make) => {
    const start = parseKmn();
    const entries = make();
    const last = entries[entries.length - 1];
    if (last === undefined || last.op !== "clear-key") throw new Error("case must end in clear-key");
    const earlier = entries.slice(0, -1);
    // Reload: the working IR is rebuilt by replay from a freshly parsed start, with no effects kept.
    const reloadedStart = parseKmn(emit(start));
    const reloaded = replayKmnEdits(reloadedStart, earlier).ir;
    const restored = clearKeyLive(reloaded, last, reloadedStart, earlier).ir;
    const replayed = replayKmnEdits(start, entries).ir;
    expect(slotLines(restored, last.vkey, last.layer)).toEqual(slotLines(replayed, last.vkey, last.layer));
    expect(emit(restored)).toBe(emit(replayed));
  });

  it("leaves contextual rows and other slots as the live IR has them", () => {
    const start = parseKmn();
    const entries = [
      setKey("K_A", "p"),
      { seq: ++seq, at, op: "remove-row", vkey: "K_B", layer: [], context: [{ kind: "text", text: "q" }] } as KmnEdit,
    ];
    const afterEdits = live(start, entries);
    const clear = { seq: ++seq, at, op: "clear-key", vkey: "K_A", layer: [] } as const;
    const out = clearKeyLive(afterEdits, clear, start, entries).ir;
    expect(emit(out)).not.toContain("U+0071 + [K_B]");
    expect(slotLines(out, "K_A", [])).toEqual(slotLines(start, "K_A", []));
  });
});

describe("replayKmnEdits: Code-tab entries (spec 113 T096)", () => {
  const edited = (ir: ReturnType<typeof parseKmn>, from: string, to: string) =>
    parse(emit(ir).replace(from, to), "layout-ops-test").ir;

  it("a code-apply entry replays its changes; review-kept has no IR effect", () => {
    const ir = parseKmn();
    const changes = diffIR(ir, edited(ir, "+ [K_B] > U+0062", "+ [K_B] > U+0043"));
    const code: KmnEdit = { seq: 1, at: 0, op: "code-apply", changes, overrides: [] };
    const kept: KmnEdit = { seq: 2, at: 0, op: "review-kept", target: 1 };
    const withKept = replayKmnEdits(ir, [code, kept]);
    const without = replayKmnEdits(ir, [code]);
    expect(withKept.misses).toEqual([]);
    expect(emit(withKept.ir)).toBe(emit(without.ir));
    expect(emit(withKept.ir)).toBe(emit(applyIRChanges(ir, changes).ir));
    expect(emit(withKept.ir)).toContain("+ [K_B] > U+0043");
  });

  it("mixes Layout and Code entries in order", () => {
    const ir = parseKmn();
    const changes = diffIR(ir, edited(ir, "+ [K_B] > U+0062", "+ [K_B] > U+0043"));
    const entries: KmnEdit[] = [
      { seq: 1, at: 0, op: "set-key", vkey: "K_A", layer: [], output: { kind: "text", text: "p" } },
      { seq: 2, at: 0, op: "code-apply", changes, overrides: [] },
    ];
    const out = replayKmnEdits(ir, entries);
    expect(out.misses).toEqual([]);
    const text = emit(out.ir);
    expect(text).toContain("U+0070");
    expect(text).toContain("+ [K_B] > U+0043");
  });

  it("a change whose anchor is gone is a miss tagged with the entry's seq", () => {
    const ir = parseKmn();
    const changes = diffIR(ir, edited(ir, "+ [K_B] > U+0062", "+ [K_B] > U+0043"));
    const gone = parse(emit(ir).replace("+ [K_B] > U+0062\n", ""), "layout-ops-test").ir;
    const out = replayKmnEdits(gone, [{ seq: 7, at: 0, op: "code-apply", changes, overrides: [] }]);
    expect(out.misses).toHaveLength(1);
    expect(out.misses[0]?.seq).toBe(7);
    expect(emit(out.ir)).toBe(emit(gone));
  });
});

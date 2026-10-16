/**
 * #2216 — a `*Wire` source-encoding hint must never outrank the numeric
 * value it was parsed with. When a mutator (or any direct edit) changes
 * `sp`/`width`/`pad` on a parsed key, emit must write the NEW value — the
 * stale hint is dropped / ignored and the emitter falls back to the
 * Keyman-canonical string form. When the value is unchanged, the source
 * encoding is preserved byte-for-byte (#2083 fidelity).
 *
 * These tests mutate the IR directly (below every mutator) so they pin the
 * emitter-side invariant itself: no IR state reachable by editing a numeric
 * field can emit the pre-edit value. Per-mutator clearing is pinned
 * separately in the pattern-apply suites.
 */

import { describe, it, expect } from "vitest";
import { parseTouchLayout, emitTouchLayout } from "./parse-touch.js";
import type { TouchKeyIR, TouchLayoutIR } from "@keyboard-studio/contracts";

type WireKey = Record<string, unknown>;

/** One phone platform / one layer / one row holding the given wire keys. */
function layoutWith(keys: WireKey[]): string {
  return JSON.stringify({
    phone: { layer: [{ id: "default", row: [{ id: 1, key: keys }] }] },
  });
}

function firstKey(ir: TouchLayoutIR): TouchKeyIR {
  return ir.platforms[0]!.layers[0]!.rows[0]!.keys[0]!;
}

function emittedKeys(ir: TouchLayoutIR): WireKey[] {
  const out = JSON.parse(emitTouchLayout(ir)) as {
    phone: { layer: Array<{ row: Array<{ key: WireKey[] }> }> };
  };
  return out.phone.layer[0]!.row[0]!.key;
}

describe("#2216 issue regression: parse a \"1\" key, set sp = 2, emit writes the new value", () => {
  it("sp: string-encoded source", () => {
    const ir = parseTouchLayout(layoutWith([{ id: "K_A", sp: "1" }]));
    firstKey(ir).sp = 2;
    expect(emittedKeys(ir)[0]!.sp).toBe("2");
  });

  it("sp: numeric source", () => {
    const ir = parseTouchLayout(layoutWith([{ id: "K_A", sp: 1 }]));
    firstKey(ir).sp = 2;
    expect(emittedKeys(ir)[0]!.sp).toBe("2");
  });

  it("width: string-encoded source", () => {
    const ir = parseTouchLayout(layoutWith([{ id: "K_A", width: "100" }]));
    firstKey(ir).width = 140;
    expect(emittedKeys(ir)[0]!.width).toBe("140");
  });

  it("pad: string-encoded source", () => {
    const ir = parseTouchLayout(layoutWith([{ id: "K_A", pad: "50" }]));
    firstKey(ir).pad = 20;
    expect(emittedKeys(ir)[0]!.pad).toBe("20");
  });

  it("nested sub-key (sk) sp mutation is honoured through emitKey recursion", () => {
    const ir = parseTouchLayout(
      layoutWith([{ id: "K_A", sk: [{ id: "U_00E7", sp: "1" }] }]),
    );
    firstKey(ir).sk![0]!.sp = 2;
    const sk = emittedKeys(ir)[0]!.sk as WireKey[];
    expect(sk[0]!.sp).toBe("2");
  });
});

describe("#2216 invariant: field × encoding × {unchanged, changed}", () => {
  const cases = [
    { field: "sp", from: "1", changedTo: 2, emittedChanged: "2" },
    { field: "sp", from: 1, changedTo: 2, emittedChanged: "2" },
    { field: "width", from: "100", changedTo: 140, emittedChanged: "140" },
    { field: "width", from: 100, changedTo: 140, emittedChanged: "140" },
    { field: "pad", from: "50", changedTo: 20, emittedChanged: "20" },
    { field: "pad", from: 50, changedTo: 20, emittedChanged: "20" },
  ] as const;

  for (const c of cases) {
    it(`${c.field} from ${JSON.stringify(c.from)}: unchanged keeps the source encoding exactly`, () => {
      const ir = parseTouchLayout(layoutWith([{ id: "K_A", [c.field]: c.from }]));
      expect(emittedKeys(ir)[0]![c.field]).toBe(c.from);
    });

    it(`${c.field} from ${JSON.stringify(c.from)}: changed emits the new value, never the old`, () => {
      const ir = parseTouchLayout(layoutWith([{ id: "K_A", [c.field]: c.from }]));
      (firstKey(ir) as Record<string, unknown>)[c.field] = c.changedTo;
      expect(emittedKeys(ir)[0]![c.field]).toBe(c.emittedChanged);
    });
  }

  it("an unrelated edit (text) does not disturb any encoding", () => {
    const ir = parseTouchLayout(
      layoutWith([{ id: "K_A", text: "a", sp: "1", width: 100, pad: "50" }]),
    );
    firstKey(ir).text = "A";
    const key = emittedKeys(ir)[0]!;
    expect(key.sp).toBe("1");
    expect(key.width).toBe(100);
    expect(key.pad).toBe("50");
  });

  it("fractional width (redistribution arithmetic) emits the fraction, not the stale integer hint", () => {
    const ir = parseTouchLayout(layoutWith([{ id: "K_A", width: 100 }]));
    firstKey(ir).width = 150.5;
    expect(emittedKeys(ir)[0]!.width).toBe("150.5");
  });

  it("a hint that still denotes the current value is honoured (\"100.0\" stays \"100.0\")", () => {
    const ir = parseTouchLayout(layoutWith([{ id: "K_A", width: "100.0" }]));
    expect(emittedKeys(ir)[0]!.width).toBe("100.0");
  });
});

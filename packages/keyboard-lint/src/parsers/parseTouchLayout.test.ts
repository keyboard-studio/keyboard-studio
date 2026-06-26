import { describe, it, expect } from "vitest";
import { parseTouchLayout } from "./parseTouchLayout.js";
import type { VirtualFS } from "@keyboard-studio/contracts";

/** Build a minimal VirtualFS with a single file. */
function makeFS(keyboardId: string, content: string): VirtualFS {
  const path = `source/${keyboardId}.keyman-touch-layout`;
  return {
    get: (p: string) => (p === path ? { content } : undefined),
  } as unknown as VirtualFS;
}

describe("parseTouchLayout — sp/width wire-format coercion", () => {
  it("coerces string-encoded sp and width to numbers in TouchKeyIR", () => {
    const json = JSON.stringify({
      phone: {
        layer: [
          {
            id: "default",
            row: [
              {
                key: [
                  { id: "K_A", sp: "1", width: "100" },
                ],
              },
            ],
          },
        ],
      },
    });

    const ir = parseTouchLayout(makeFS("test", json), "test");
    expect(ir).toBeDefined();
    const key = ir!.platforms[0]!.layers[0]!.rows[0]!.keys[0]!;
    expect(typeof key.sp).toBe("number");
    expect(key.sp).toBe(1);
    expect(typeof key.width).toBe("number");
    expect(key.width).toBe(100);
  });

  it("also accepts numeric sp and width (backward-compatible)", () => {
    const json = JSON.stringify({
      phone: {
        layer: [
          {
            id: "default",
            row: [{ key: [{ id: "K_B", sp: 2, width: 150 }] }],
          },
        ],
      },
    });

    const ir = parseTouchLayout(makeFS("test2", json), "test2");
    expect(ir).toBeDefined();
    const key = ir!.platforms[0]!.layers[0]!.rows[0]!.keys[0]!;
    expect(key.sp).toBe(2);
    expect(key.width).toBe(150);
  });

  it("leaves sp and width undefined when the raw value is non-numeric", () => {
    const json = JSON.stringify({
      phone: {
        layer: [
          {
            id: "default",
            row: [{ key: [{ id: "K_C", sp: "bad", width: "also-bad" }] }],
          },
        ],
      },
    });

    const ir = parseTouchLayout(makeFS("test3", json), "test3");
    const key = ir!.platforms[0]!.layers[0]!.rows[0]!.keys[0]!;
    expect(key.sp).toBeUndefined();
    expect(key.width).toBeUndefined();
  });
});

describe("parseTouchLayout — deterministic nodeIds (fix 2)", () => {
  const json = JSON.stringify({
    phone: {
      layer: [
        {
          id: "default",
          row: [{ key: [{ id: "K_A" }, { id: "K_B" }] }],
        },
      ],
    },
  });

  it("produces the same nodeIds on every call for the same input", () => {
    const ir1 = parseTouchLayout(makeFS("det", json), "det");
    const ir2 = parseTouchLayout(makeFS("det", json), "det");
    expect(ir1).toBeDefined();
    expect(ir2).toBeDefined();
    const ids1 = ir1!.platforms[0]!.layers[0]!.rows[0]!.keys.map((k) => k.nodeId);
    const ids2 = ir2!.platforms[0]!.layers[0]!.rows[0]!.keys.map((k) => k.nodeId);
    expect(ids1).toEqual(ids2);
  });

  it("resets the nodeId counter per call so two independent parses start at the same first id", () => {
    const ir1 = parseTouchLayout(makeFS("det", json), "det");
    const ir2 = parseTouchLayout(makeFS("det", json), "det");
    const firstId1 = ir1!.platforms[0]!.layers[0]!.rows[0]!.keys[0]!.nodeId;
    const firstId2 = ir2!.platforms[0]!.layers[0]!.rows[0]!.keys[0]!.nodeId;
    expect(firstId1).toBe(firstId2);
    // Canonical shared parser mints touchKey#<n> from a per-call counter (#354).
    expect(firstId1).toBe("touchKey#0");
  });
});

describe("parseTouchLayout — string sp/width preserved through 18.4 drift comparison", () => {
  it("drift check still detects a sp change when values come from string wire format", () => {
    // Two-layer layout where sp is encoded as a string in both layers but differs.
    const json = JSON.stringify({
      phone: {
        layer: [
          {
            id: "default",
            row: [{ key: [{ id: "K_BKSP", sp: "1", width: "100" }] }],
          },
          {
            id: "shifted",
            row: [{ key: [{ id: "K_BKSP", sp: "2", width: "100" }] }],
          },
        ],
      },
    });

    const ir = parseTouchLayout(makeFS("drifttest", json), "drifttest");
    expect(ir).toBeDefined();
    // After coercion, sp values are numbers; check the numeric values are distinct.
    const layer0Key = ir!.platforms[0]!.layers[0]!.rows[0]!.keys[0]!;
    const layer1Key = ir!.platforms[0]!.layers[1]!.rows[0]!.keys[0]!;
    expect(layer0Key.sp).toBe(1);
    expect(layer1Key.sp).toBe(2);
    // The numeric inequality means check-18-4 will fire — proved here at the IR level.
    expect(layer0Key.sp).not.toBe(layer1Key.sp);
  });
});

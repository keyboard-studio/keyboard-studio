import { describe, it, expect } from "vitest";
import { makeLocation, walkTouchKeys } from "./_shared.js";
import type { TouchLayoutIR } from "@keyboard-studio/contracts";

// _shared.ts holds the two helpers shared by the check-18-* (touch-layout /
// DISCUS) checks: makeLocation (the placeholder line:1 location every
// check-18-* finding uses, since touch-layout checks operate on the parsed
// IR rather than source text) and walkTouchKeys (the platform -> layer ->
// row -> key iterator). This suite pins both helpers' contracts directly,
// mirroring engine/src/validator/checks/_shared.test.ts's style for
// forEachMatch, so a regression here doesn't hide behind the four check-18-*
// checks' own fixtures.

describe("makeLocation", () => {
  it("returns the touch-layout path as file with a fixed placeholder line of 1", () => {
    expect(makeLocation("source/test.keyman-touch-layout")).toEqual({
      file: "source/test.keyman-touch-layout",
      line: 1,
    });
  });

  it("passes the path through verbatim, including nested VFS paths", () => {
    expect(makeLocation("source/nested/dir/keyboard.keyman-touch-layout")).toEqual({
      file: "source/nested/dir/keyboard.keyman-touch-layout",
      line: 1,
    });
  });
});

describe("walkTouchKeys", () => {
  /** Minimal single-platform, single-layer, single-row IR with the given keys. */
  function makeSimpleIR(keys: TouchLayoutIR["platforms"][number]["layers"][number]["rows"][number]["keys"]): TouchLayoutIR {
    return {
      platforms: [
        {
          id: "phone",
          layers: [{ id: "default", rows: [{ keys }] }],
        },
      ],
      nodeIds: [],
    };
  }

  it("visits every leaf key exactly once", () => {
    const ir = makeSimpleIR([
      { nodeId: "k-a", id: "K_A" },
      { nodeId: "k-b", id: "K_B" },
    ]);
    const visited: string[] = [];
    walkTouchKeys(ir, ({ key }) => {
      visited.push(key.id);
    });
    expect(visited).toEqual(["K_A", "K_B"]);
  });

  it("walks in platform -> layer -> row -> key order, outer to inner", () => {
    const ir: TouchLayoutIR = {
      platforms: [
        {
          id: "phone",
          layers: [
            { id: "default", rows: [{ keys: [{ nodeId: "p-def-r0-k0", id: "K_1" }] }] },
            { id: "shifted", rows: [{ keys: [{ nodeId: "p-shift-r0-k0", id: "K_2" }] }] },
          ],
        },
        {
          id: "tablet",
          layers: [
            {
              id: "default",
              rows: [
                { keys: [{ nodeId: "t-def-r0-k0", id: "K_3" }, { nodeId: "t-def-r0-k1", id: "K_4" }] },
                { keys: [{ nodeId: "t-def-r1-k0", id: "K_5" }] },
              ],
            },
          ],
        },
      ],
      nodeIds: [],
    };

    const visited: Array<{ platform: string; layer: string; rowIndex: number; keyIndex: number; id: string }> = [];
    walkTouchKeys(ir, ({ platform, layer, rowIndex, keyIndex, key }) => {
      visited.push({ platform: platform.id, layer: layer.id, rowIndex, keyIndex, id: key.id });
    });

    expect(visited).toEqual([
      { platform: "phone", layer: "default", rowIndex: 0, keyIndex: 0, id: "K_1" },
      { platform: "phone", layer: "shifted", rowIndex: 0, keyIndex: 0, id: "K_2" },
      { platform: "tablet", layer: "default", rowIndex: 0, keyIndex: 0, id: "K_3" },
      { platform: "tablet", layer: "default", rowIndex: 0, keyIndex: 1, id: "K_4" },
      { platform: "tablet", layer: "default", rowIndex: 1, keyIndex: 0, id: "K_5" },
    ]);
  });

  it("passes the correct platform/layer/row object references and rowIndex/keyIndex alongside each key", () => {
    const ir: TouchLayoutIR = {
      platforms: [
        {
          id: "phone",
          layers: [{ id: "default", rows: [{ keys: [{ nodeId: "k-a", id: "K_A" }] }] }],
        },
      ],
      nodeIds: [],
    };

    let seen: {
      platform: unknown;
      layer: unknown;
      row: unknown;
      rowIndex: number;
      keyIndex: number;
    } | null = null;
    walkTouchKeys(ir, (ctx) => {
      seen = {
        platform: ctx.platform,
        layer: ctx.layer,
        row: ctx.row,
        rowIndex: ctx.rowIndex,
        keyIndex: ctx.keyIndex,
      };
    });

    expect(seen).not.toBeNull();
    expect(seen).toEqual({
      platform: ir.platforms[0],
      layer: ir.platforms[0]?.layers[0],
      row: ir.platforms[0]?.layers[0]?.rows[0],
      rowIndex: 0,
      keyIndex: 0,
    });
  });

  it("does NOT descend into a key's sk (longpress) sub-keys", () => {
    // A regression that recursed into `sk` would report K_SK1 as a walked
    // leaf key (with its own ctx), which would break every check-18-* check
    // that assumes one callback invocation per row-positioned key (e.g.
    // check-18-1-longpress counts sk.length itself, rather than expecting
    // walkTouchKeys to have already flattened them in).
    const ir = makeSimpleIR([
      {
        nodeId: "k-a",
        id: "K_A",
        sk: [
          { nodeId: "k-a-sk1", id: "K_SK1" },
          { nodeId: "k-a-sk2", id: "K_SK2" },
        ],
      },
    ]);
    const visited: string[] = [];
    walkTouchKeys(ir, ({ key }) => {
      visited.push(key.id);
    });
    expect(visited).toEqual(["K_A"]);
  });

  it("does NOT descend into a key's multitap sub-keys", () => {
    const ir = makeSimpleIR([
      {
        nodeId: "k-a",
        id: "K_A",
        multitap: [
          { nodeId: "k-a-mt1", id: "K_MT1" },
          { nodeId: "k-a-mt2", id: "K_MT2" },
        ],
      },
    ]);
    const visited: string[] = [];
    walkTouchKeys(ir, ({ key }) => {
      visited.push(key.id);
    });
    expect(visited).toEqual(["K_A"]);
  });

  it("does NOT descend into a key's flick sub-keys", () => {
    const ir = makeSimpleIR([
      {
        nodeId: "k-a",
        id: "K_A",
        flick: {
          n: { nodeId: "k-a-flick-n", id: "K_FLICK_N" },
          e: { nodeId: "k-a-flick-e", id: "K_FLICK_E" },
        },
      },
    ]);
    const visited: string[] = [];
    walkTouchKeys(ir, ({ key }) => {
      visited.push(key.id);
    });
    expect(visited).toEqual(["K_A"]);
  });

  it("invokes the callback zero times for an empty platforms array", () => {
    const ir: TouchLayoutIR = { platforms: [], nodeIds: [] };
    let count = 0;
    walkTouchKeys(ir, () => {
      count++;
    });
    expect(count).toBe(0);
  });

  it("invokes the callback zero times when rows have no keys", () => {
    const ir = makeSimpleIR([]);
    let count = 0;
    walkTouchKeys(ir, () => {
      count++;
    });
    expect(count).toBe(0);
  });
});

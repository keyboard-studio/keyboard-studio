import { describe, it, expect } from "vitest";
import { parseTouchLayout } from "./parse-touch.js";

const MINIMAL_TOUCH = JSON.stringify({
  tablet: {
    displayUnderlying: false,
    layer: [
      {
        id: "default",
        row: [
          {
            id: 1,
            key: [
              { id: "K_A", text: "a" },
              { id: "K_B", text: "b" },
            ],
          },
        ],
      },
      {
        id: "shift",
        row: [
          {
            id: 1,
            key: [
              { id: "K_A", text: "A", nextlayer: "default" },
            ],
          },
        ],
      },
    ],
  },
});

const MULTI_PLATFORM_TOUCH = JSON.stringify({
  desktop: {
    layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_D", text: "desktop" }] }] }],
  },
  tablet: {
    layer: [
      { id: "default", row: [{ id: 1, key: [{ id: "K_T", text: "tablet" }] }] },
      { id: "extra",   row: [{ id: 1, key: [{ id: "K_E", text: "extra" }] }] },
    ],
  },
  phone: {
    layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_P", text: "phone" }] }] }],
  },
});

const SUBKEY_TOUCH = JSON.stringify({
  tablet: {
    layer: [
      {
        id: "symbol",
        row: [
          {
            id: 1,
            key: [
              {
                id: "U_0028",
                text: "(",
                sk: [
                  { id: "U_005B", text: "[" },
                  { id: "U_007B", text: "{" },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
});

describe("parseTouchLayout", () => {
  it("returns TouchLayoutIR with correct layer count", () => {
    const ir = parseTouchLayout(MINIMAL_TOUCH);
    expect(ir.layers.length).toBe(2);
  });

  it("first layer has id 'default'", () => {
    const ir = parseTouchLayout(MINIMAL_TOUCH);
    expect(ir.layers[0]?.id).toBe("default");
  });

  it("second layer has id 'shift'", () => {
    const ir = parseTouchLayout(MINIMAL_TOUCH);
    expect(ir.layers[1]?.id).toBe("shift");
  });

  it("keys in first layer have correct id and text", () => {
    const ir = parseTouchLayout(MINIMAL_TOUCH);
    const row0 = ir.layers[0]?.rows[0];
    expect(row0?.keys[0]?.id).toBe("K_A");
    expect(row0?.keys[0]?.text).toBe("a");
    expect(row0?.keys[1]?.id).toBe("K_B");
  });

  it("nextlayer is preserved on key", () => {
    const ir = parseTouchLayout(MINIMAL_TOUCH);
    const shiftLayer = ir.layers.find(l => l.id === "shift");
    expect(shiftLayer?.rows[0]?.keys[0]?.nextlayer).toBe("default");
  });

  it("each key has a unique nodeId", () => {
    const ir = parseTouchLayout(MINIMAL_TOUCH);
    const allIds = ir.layers
      .flatMap(l => l.rows)
      .flatMap(r => r.keys)
      .map(k => k.nodeId);
    const unique = new Set(allIds);
    expect(unique.size).toBe(allIds.length);
  });

  it("populates nodeIds array", () => {
    const ir = parseTouchLayout(MINIMAL_TOUCH);
    expect(ir.nodeIds.length).toBeGreaterThan(0);
    const [key, ref] = ir.nodeIds[0] ?? [];
    expect(typeof key).toBe("string");
    expect(ref?.kind).toBe("touchKey");
  });

  it("multi-platform: desktop default takes priority over tablet default", () => {
    const ir = parseTouchLayout(MULTI_PLATFORM_TOUCH);
    const def = ir.layers.find(l => l.id === "default");
    expect(def).toBeDefined();
    // Should use desktop's default layer (K_D), not tablet's (K_T)
    expect(def?.rows[0]?.keys[0]?.id).toBe("K_D");
  });

  it("multi-platform: tablet-only layer 'extra' is included", () => {
    const ir = parseTouchLayout(MULTI_PLATFORM_TOUCH);
    const extra = ir.layers.find(l => l.id === "extra");
    expect(extra).toBeDefined();
    expect(extra?.rows[0]?.keys[0]?.id).toBe("K_E");
  });

  it("multi-platform: phone default is excluded when desktop already provided it", () => {
    const ir = parseTouchLayout(MULTI_PLATFORM_TOUCH);
    const defaultLayers = ir.layers.filter(l => l.id === "default");
    expect(defaultLayers.length).toBe(1);
  });

  it("subkeys (sk) are recursively parsed with their own nodeIds", () => {
    const ir = parseTouchLayout(SUBKEY_TOUCH);
    const symbolLayer = ir.layers.find(l => l.id === "symbol");
    const parentKey = symbolLayer?.rows[0]?.keys[0];
    expect(parentKey?.id).toBe("U_0028");
    expect(parentKey?.sk?.length).toBe(2);
    expect(parentKey?.sk?.[0]?.id).toBe("U_005B");
    expect(parentKey?.sk?.[0]?.nodeId).toBeTruthy();
  });

  it("throws SyntaxError on invalid JSON", () => {
    expect(() => parseTouchLayout("not json")).toThrow(SyntaxError);
  });

  it("throws TypeError on JSON array", () => {
    expect(() => parseTouchLayout("[]")).toThrow(TypeError);
  });
});

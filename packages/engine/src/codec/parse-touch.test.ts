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
  it("returns TouchLayoutIR with correct platform count", () => {
    const ir = parseTouchLayout(MINIMAL_TOUCH);
    expect(ir.platforms.length).toBe(1);
  });

  it("tablet platform has two layers", () => {
    const ir = parseTouchLayout(MINIMAL_TOUCH);
    const tablet = ir.platforms.find(p => p.id === "tablet");
    expect(tablet?.layers.length).toBe(2);
  });

  it("first layer of tablet platform has id 'default'", () => {
    const ir = parseTouchLayout(MINIMAL_TOUCH);
    const tablet = ir.platforms.find(p => p.id === "tablet");
    expect(tablet?.layers[0]?.id).toBe("default");
  });

  it("second layer of tablet platform has id 'shift'", () => {
    const ir = parseTouchLayout(MINIMAL_TOUCH);
    const tablet = ir.platforms.find(p => p.id === "tablet");
    expect(tablet?.layers[1]?.id).toBe("shift");
  });

  it("keys in first layer have correct id and text", () => {
    const ir = parseTouchLayout(MINIMAL_TOUCH);
    const tablet = ir.platforms.find(p => p.id === "tablet");
    const row0 = tablet?.layers[0]?.rows[0];
    expect(row0?.keys[0]?.id).toBe("K_A");
    expect(row0?.keys[0]?.text).toBe("a");
    expect(row0?.keys[1]?.id).toBe("K_B");
  });

  it("nextlayer is preserved on key", () => {
    const ir = parseTouchLayout(MINIMAL_TOUCH);
    const tablet = ir.platforms.find(p => p.id === "tablet");
    const shiftLayer = tablet?.layers.find(l => l.id === "shift");
    expect(shiftLayer?.rows[0]?.keys[0]?.nextlayer).toBe("default");
  });

  it("each key has a unique nodeId", () => {
    const ir = parseTouchLayout(MINIMAL_TOUCH);
    const allIds = ir.platforms
      .flatMap(p => p.layers)
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

  it("multi-platform: desktop platform is present with its default layer", () => {
    const ir = parseTouchLayout(MULTI_PLATFORM_TOUCH);
    const desktop = ir.platforms.find(p => p.id === "desktop");
    expect(desktop).toBeDefined();
    expect(desktop?.layers[0]?.rows[0]?.keys[0]?.id).toBe("K_D");
  });

  it("multi-platform: tablet-only layer 'extra' is included in tablet platform", () => {
    const ir = parseTouchLayout(MULTI_PLATFORM_TOUCH);
    const tablet = ir.platforms.find(p => p.id === "tablet");
    const extra = tablet?.layers.find(l => l.id === "extra");
    expect(extra).toBeDefined();
    expect(extra?.rows[0]?.keys[0]?.id).toBe("K_E");
  });

  it("multi-platform: each platform has its own default layer (no merging)", () => {
    const ir = parseTouchLayout(MULTI_PLATFORM_TOUCH);
    // All three platforms should be present, each with their own default layer
    expect(ir.platforms.length).toBe(3);
    const desktopDefault = ir.platforms.find(p => p.id === "desktop")?.layers.find(l => l.id === "default");
    const tabletDefault = ir.platforms.find(p => p.id === "tablet")?.layers.find(l => l.id === "default");
    const phoneDefault = ir.platforms.find(p => p.id === "phone")?.layers.find(l => l.id === "default");
    expect(desktopDefault?.rows[0]?.keys[0]?.id).toBe("K_D");
    expect(tabletDefault?.rows[0]?.keys[0]?.id).toBe("K_T");
    expect(phoneDefault?.rows[0]?.keys[0]?.id).toBe("K_P");
  });

  it("subkeys (sk) are recursively parsed with their own nodeIds", () => {
    const ir = parseTouchLayout(SUBKEY_TOUCH);
    const tablet = ir.platforms.find(p => p.id === "tablet");
    const symbolLayer = tablet?.layers.find(l => l.id === "symbol");
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

import { describe, it, expect } from "vitest";
import { parseTouchLayout, emitTouchLayout } from "./parse-touch.js";

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

  // sp / width / hint preservation -----------------------------------------

  it("parses sp, width, and hint from string wire values to correct IR types", () => {
    const json = JSON.stringify({
      phone: {
        layer: [{
          id: "default",
          row: [{
            id: 1,
            key: [{ id: "K_A", text: "a", sp: "1", width: "150", hint: "x" }],
          }],
        }],
      },
    });
    const ir = parseTouchLayout(json);
    const key = ir.platforms[0]?.layers[0]?.rows[0]?.keys[0];
    expect(key?.sp).toBe(1);
    expect(key?.width).toBe(150);
    expect(key?.hint).toBe("x");
  });

  it("parses sp and width when supplied as numbers (robustness)", () => {
    const json = JSON.stringify({
      phone: {
        layer: [{
          id: "default",
          row: [{
            id: 1,
            key: [{ id: "K_B", text: "b", sp: 2, width: 200 }],
          }],
        }],
      },
    });
    const ir = parseTouchLayout(json);
    const key = ir.platforms[0]?.layers[0]?.rows[0]?.keys[0];
    expect(key?.sp).toBe(2);
    expect(key?.width).toBe(200);
  });

  it("leaves sp, width, hint undefined when absent from raw key", () => {
    const ir = parseTouchLayout(MINIMAL_TOUCH);
    const key = ir.platforms[0]?.layers[0]?.rows[0]?.keys[0];
    expect(key?.sp).toBeUndefined();
    expect(key?.width).toBeUndefined();
    expect(key?.hint).toBeUndefined();
  });

  it("does not set sp or width when raw values are empty strings or NaN-producing", () => {
    const json = JSON.stringify({
      phone: {
        layer: [{
          id: "default",
          row: [{
            id: 1,
            key: [{ id: "K_C", text: "c", sp: "", width: "notanumber" }],
          }],
        }],
      },
    });
    const ir = parseTouchLayout(json);
    const key = ir.platforms[0]?.layers[0]?.rows[0]?.keys[0];
    expect(key?.sp).toBeUndefined();
    expect(key?.width).toBeUndefined();
  });

  it("sp=0 is preserved (falsy but valid spacer key class)", () => {
    const json = JSON.stringify({
      phone: {
        layer: [{
          id: "default",
          row: [{
            id: 1,
            key: [{ id: "K_SP0", sp: "0", width: "50" }],
          }],
        }],
      },
    });
    const ir = parseTouchLayout(json);
    const key = ir.platforms[0]?.layers[0]?.rows[0]?.keys[0];
    expect(key?.sp).toBe(0);
    expect(key?.width).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// emitTouchLayout — kmc-kmn compat: row id + platform defaultHint
// ---------------------------------------------------------------------------

describe("emitTouchLayout", () => {
  it("emits numeric row id on every row (required by TouchLayoutFileWriter.fixup)", () => {
    // Parse a fixture that has row ids, then emit and re-parse to confirm
    // the emitted JSON includes id on every row.
    const ir = parseTouchLayout(MULTI_PLATFORM_TOUCH);
    const json = emitTouchLayout(ir);
    const reparsed = JSON.parse(json) as Record<string, { layer: Array<{ row: Array<{ id?: number }> }> }>;
    for (const [, platform] of Object.entries(reparsed)) {
      for (const layer of platform.layer) {
        for (let i = 0; i < layer.row.length; i++) {
          expect(layer.row[i]!.id, `row[${i}].id must be present`).toBe(i + 1);
        }
      }
    }
  });

  it("emits defaultHint 'dot' on every platform (dot hint — no char revealed)", () => {
    // "dot" causes the Keyman runtime to render a generic • on any key with
    // longpress sub-keys, rather than showing the first sub-key character.
    const ir = parseTouchLayout(MULTI_PLATFORM_TOUCH);
    const json = emitTouchLayout(ir);
    const reparsed = JSON.parse(json) as Record<string, { defaultHint?: string }>;
    for (const [pid, platform] of Object.entries(reparsed)) {
      expect(platform.defaultHint, `platform "${pid}" must have defaultHint`).toBe("dot");
    }
  });

  it("round-trips sp/width/hint: parse → emit → reparse preserves numeric IR and string wire values", () => {
    const source = JSON.stringify({
      phone: {
        layer: [{
          id: "default",
          row: [{
            id: 1,
            key: [{ id: "K_A", text: "a", sp: "1", width: "150", hint: "x" }],
          }],
        }],
      },
    });
    const ir = parseTouchLayout(source);
    // IR must have numeric sp/width
    const irKey = ir.platforms[0]?.layers[0]?.rows[0]?.keys[0];
    expect(irKey?.sp).toBe(1);
    expect(irKey?.width).toBe(150);
    expect(irKey?.hint).toBe("x");

    // Emitted JSON must re-encode sp/width as strings
    const emitted = emitTouchLayout(ir);
    const reparsed = JSON.parse(emitted) as Record<string, { layer: Array<{ row: Array<{ key: Array<{ sp?: string; width?: string; hint?: string }> }> }> }>;
    const wireKey = reparsed["phone"]?.layer[0]?.row[0]?.key[0];
    expect(wireKey?.sp).toBe("1");
    expect(wireKey?.width).toBe("150");
    expect(wireKey?.hint).toBe("x");

    // Re-parsed IR from emitted JSON should also have numeric sp/width
    const ir2 = parseTouchLayout(emitted);
    const irKey2 = ir2.platforms[0]?.layers[0]?.rows[0]?.keys[0];
    expect(irKey2?.sp).toBe(1);
    expect(irKey2?.width).toBe(150);
    expect(irKey2?.hint).toBe("x");
  });

  it("round-trips pad: parse → emit → reparse preserves pad as numeric IR and string wire value", () => {
    // FIX 2: pad is now parsed from the wire format and emitted back as a string.
    const source = JSON.stringify({
      phone: {
        layer: [{
          id: "default",
          row: [{
            id: 1,
            key: [{ id: "K_Z", text: "z", pad: "50" }],
          }],
        }],
      },
    });
    // Parse: wire string "50" → IR number 50
    const ir = parseTouchLayout(source);
    const irKey = ir.platforms[0]?.layers[0]?.rows[0]?.keys[0];
    expect(irKey?.pad).toBe(50);

    // Emit: IR number 50 → wire string "50"
    const emitted = emitTouchLayout(ir);
    const reparsed = JSON.parse(emitted) as Record<string, { layer: Array<{ row: Array<{ key: Array<{ pad?: string }> }> }> }>;
    const wireKey = reparsed["phone"]?.layer[0]?.row[0]?.key[0];
    expect(wireKey?.pad).toBe("50");

    // Re-parse the emitted JSON: wire string "50" → IR number 50 again
    const ir2 = parseTouchLayout(emitted);
    const irKey2 = ir2.platforms[0]?.layers[0]?.rows[0]?.keys[0];
    expect(irKey2?.pad).toBe(50);
  });

  it("parses pad when supplied as a number (robustness)", () => {
    const json = JSON.stringify({
      phone: {
        layer: [{
          id: "default",
          row: [{
            id: 1,
            key: [{ id: "K_Z", pad: 172 }],
          }],
        }],
      },
    });
    const ir = parseTouchLayout(json);
    const key = ir.platforms[0]?.layers[0]?.rows[0]?.keys[0];
    expect(key?.pad).toBe(172);
  });

  it("does not set pad when raw value is empty string or NaN-producing", () => {
    const json = JSON.stringify({
      phone: {
        layer: [{
          id: "default",
          row: [{
            id: 1,
            key: [{ id: "K_Z", pad: "" }],
          }],
        }],
      },
    });
    const ir = parseTouchLayout(json);
    const key = ir.platforms[0]?.layers[0]?.rows[0]?.keys[0];
    expect(key?.pad).toBeUndefined();
  });

  it("round-trips key ids and text through emit → reparse", () => {
    const ir = parseTouchLayout(SUBKEY_TOUCH);
    const json = emitTouchLayout(ir);
    const reparsed = JSON.parse(json) as Record<string, { layer: Array<{ row: Array<{ key: Array<{ id: string; sk?: Array<{ id: string }> }> }> }> }>;
    const tabletLayer = reparsed["tablet"]?.layer[0];
    const parentKey = tabletLayer?.row[0]?.key[0];
    expect(parentKey?.id).toBe("U_0028");
    expect(parentKey?.sk?.length).toBe(2);
    expect(parentKey?.sk?.[0]?.id).toBe("U_005B");
  });

  // ---------------------------------------------------------------------------
  // Flick + multitap round-trip — regression guard for the parser consolidation
  //
  // The old engine parser merged multitap into sk on parse.  After the
  // canonical-parser consolidation the full cycle must be stable:
  //   parseTouchLayout → emitTouchLayout → parseTouchLayout again
  // Both flick directions and multitap entries must survive unchanged.
  // ---------------------------------------------------------------------------

  it("round-trips flick directions and multitap through parse → emit → parse", () => {
    const source = JSON.stringify({
      phone: {
        layer: [
          {
            id: "default",
            row: [
              {
                id: 1,
                key: [
                  {
                    id: "K_A",
                    text: "a",
                    // One flick direction (north) — exercises the flick map path
                    flick: {
                      n: { id: "K_FN", text: "north" },
                      e: { id: "K_FE", text: "east" },
                    },
                    // Longpress sub-keys — must stay in sk
                    sk: [{ id: "K_S1", text: "long-a" }],
                    // Tap-cycle entries — must stay in multitap, NOT merged into sk
                    multitap: [
                      { id: "K_T1", text: "tap-1" },
                      { id: "K_T2", text: "tap-2" },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    // First parse
    const ir1 = parseTouchLayout(source);
    const key1 = ir1.platforms[0]!.layers[0]!.rows[0]!.keys[0]!;

    // Sanity-check the first parse
    expect(key1.flick?.n?.id).toBe("K_FN");
    expect(key1.flick?.e?.id).toBe("K_FE");
    expect(key1.sk?.length).toBe(1);
    expect(key1.multitap?.length).toBe(2);

    // Emit to JSON, then re-parse
    const emitted = emitTouchLayout(ir1);
    const ir2 = parseTouchLayout(emitted);
    const key2 = ir2.platforms[0]!.layers[0]!.rows[0]!.keys[0]!;

    // Flick directions survive the round-trip
    expect(key2.flick?.n?.id, "flick north id must survive round-trip").toBe("K_FN");
    expect(key2.flick?.n?.text, "flick north text must survive round-trip").toBe("north");
    expect(key2.flick?.e?.id, "flick east id must survive round-trip").toBe("K_FE");

    // Unknown directions were never present — confirm no phantom keys
    expect(Object.keys(key2.flick ?? {})).toEqual(
      expect.arrayContaining(["n", "e"]),
    );
    expect(Object.keys(key2.flick ?? {}).length).toBe(2);

    // sk survives unchanged
    expect(key2.sk?.length, "sk count must be stable across round-trip").toBe(1);
    expect(key2.sk?.[0]?.id).toBe("K_S1");

    // multitap survives unchanged and is NOT merged into sk
    expect(key2.multitap?.length, "multitap count must be stable across round-trip").toBe(2);
    expect(key2.multitap?.[0]?.id).toBe("K_T1");
    expect(key2.multitap?.[1]?.id).toBe("K_T2");

    // Guarantee: multitap ids did not leak into sk
    const skIds2 = (key2.sk ?? []).map((k) => k.id);
    for (const mt of key2.multitap ?? []) {
      expect(
        skIds2,
        `multitap id "${mt.id}" must not appear in sk after round-trip`,
      ).not.toContain(mt.id);
    }
  });
});

// ---------------------------------------------------------------------------
// flick — directional gesture map (previously dropped by convertKey)
// ---------------------------------------------------------------------------

const FLICK_TOUCH = JSON.stringify({
  tablet: {
    layer: [
      {
        id: "default",
        row: [
          {
            id: 1,
            key: [
              {
                id: "U_0065",
                text: "e",
                flick: {
                  n: { id: "U_0065_n", text: "é", output: "é" },
                  sw: { id: "U_0065_sw", text: "è", output: "è" },
                },
              },
            ],
          },
        ],
      },
    ],
  },
});

describe("parseTouchLayout - flick", () => {
  it("parses flick entries in >= 2 directions into TouchKeyIR.flick with text/output/id intact", () => {
    const ir = parseTouchLayout(FLICK_TOUCH);
    const key = ir.platforms[0]?.layers[0]?.rows[0]?.keys[0];
    expect(key?.flick?.n?.id).toBe("U_0065_n");
    expect(key?.flick?.n?.text).toBe("é");
    expect(key?.flick?.n?.output).toBe("é");
    expect(key?.flick?.sw?.id).toBe("U_0065_sw");
    expect(key?.flick?.sw?.text).toBe("è");
    expect(key?.flick?.sw?.output).toBe("è");
  });

  it("round-trips flick through emit -> reparse", () => {
    const ir = parseTouchLayout(FLICK_TOUCH);
    const emitted = emitTouchLayout(ir);
    const reparsed = JSON.parse(emitted) as Record<
      string,
      { layer: Array<{ row: Array<{ key: Array<{ flick?: Record<string, { id: string; text?: string; output?: string }> }> }> }> }
    >;
    const wireKey = reparsed["tablet"]?.layer[0]?.row[0]?.key[0];
    expect(wireKey?.flick?.["n"]?.id).toBe("U_0065_n");
    expect(wireKey?.flick?.["n"]?.text).toBe("é");
    expect(wireKey?.flick?.["sw"]?.id).toBe("U_0065_sw");
    expect(wireKey?.flick?.["sw"]?.text).toBe("è");

    const ir2 = parseTouchLayout(emitted);
    const key2 = ir2.platforms[0]?.layers[0]?.rows[0]?.keys[0];
    expect(key2?.flick?.n?.id).toBe("U_0065_n");
    expect(key2?.flick?.n?.output).toBe("é");
    expect(key2?.flick?.sw?.id).toBe("U_0065_sw");
    expect(key2?.flick?.sw?.output).toBe("è");
  });

  it("drops a flick entry keyed by an unknown/bogus direction, keeping valid ones", () => {
    const json = JSON.stringify({
      tablet: {
        layer: [
          {
            id: "default",
            row: [
              {
                id: 1,
                key: [
                  {
                    id: "U_0065",
                    text: "e",
                    flick: {
                      n: { id: "U_0065_n", text: "é", output: "é" },
                      // bogus direction key — not in the compass-direction vocabulary
                      xx: { id: "U_0065_xx", text: "?", output: "?" },
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    const ir = parseTouchLayout(json);
    const key = ir.platforms[0]?.layers[0]?.rows[0]?.keys[0];
    expect(key?.flick?.n?.id).toBe("U_0065_n");
    expect(Object.keys(key?.flick ?? {})).toEqual(["n"]);
  });
});

// ---------------------------------------------------------------------------
// Per-key provenance round-trip (spec-014 US3 / T028, FR-009/FR-010)
// ---------------------------------------------------------------------------

describe("touch-key provenance round-trip (spec-014 T028)", () => {
  const PROVENANCE_TAGGED = JSON.stringify({
    tablet: {
      layer: [{
        id: "default",
        row: [{
          id: 1,
          key: [
            { id: "K_A", text: "a", p: "base-derived" },
            { id: "K_B", text: "b", p: "physical-suggested" },
            { id: "K_C", text: "c", p: "hand-set" },
            // legacy/untagged key — no "p" property
            { id: "K_D", text: "d" },
          ],
        }],
      }],
    },
  });

  it("parses each provenance wire value into the IR", () => {
    const ir = parseTouchLayout(PROVENANCE_TAGGED);
    const keys = ir.platforms[0]?.layers[0]?.rows[0]?.keys;
    expect(keys?.[0]?.provenance).toBe("base-derived");
    expect(keys?.[1]?.provenance).toBe("physical-suggested");
    expect(keys?.[2]?.provenance).toBe("hand-set");
  });

  it("defaults an untagged/legacy key to hand-set on parse (FR-009)", () => {
    const ir = parseTouchLayout(PROVENANCE_TAGGED);
    const legacyKey = ir.platforms[0]?.layers[0]?.rows[0]?.keys[3];
    expect(legacyKey?.id).toBe("K_D");
    expect(legacyKey?.provenance).toBe("hand-set");
  });

  it("defaults an out-of-vocabulary provenance value to hand-set", () => {
    const json = JSON.stringify({
      tablet: { layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_X", p: "garbage" }] }] }] },
    });
    const ir = parseTouchLayout(json);
    expect(ir.platforms[0]?.layers[0]?.rows[0]?.keys[0]?.provenance).toBe("hand-set");
  });

  it("emits provenance to the 'p' wire property", () => {
    const ir = parseTouchLayout(PROVENANCE_TAGGED);
    const emitted = emitTouchLayout(ir);
    const reparsed = JSON.parse(emitted) as Record<string, { layer: Array<{ row: Array<{ key: Array<{ id: string; p?: string }> }> }> }>;
    const wireKeys = reparsed["tablet"]?.layer[0]?.row[0]?.key;
    expect(wireKeys?.[0]?.p).toBe("base-derived");
    expect(wireKeys?.[1]?.p).toBe("physical-suggested");
    expect(wireKeys?.[2]?.p).toBe("hand-set");
    // legacy key materialised to hand-set on parse, so it is emitted as hand-set
    expect(wireKeys?.[3]?.p).toBe("hand-set");
  });

  it("survives a full parse → emit → reparse cycle with every tag intact (FR-010)", () => {
    const ir = parseTouchLayout(PROVENANCE_TAGGED);
    const ir2 = parseTouchLayout(emitTouchLayout(ir));
    const keys = ir2.platforms[0]?.layers[0]?.rows[0]?.keys;
    expect(keys?.map((k) => k.provenance)).toEqual([
      "base-derived",
      "physical-suggested",
      "hand-set",
      "hand-set",
    ]);
  });

  it("round-trips provenance on subkeys (sk) too", () => {
    const json = JSON.stringify({
      tablet: {
        layer: [{
          id: "symbol",
          row: [{
            id: 1,
            key: [{
              id: "U_0028", text: "(", p: "physical-suggested",
              sk: [{ id: "U_005B", text: "[", p: "base-derived" }],
            }],
          }],
        }],
      },
    });
    const ir2 = parseTouchLayout(emitTouchLayout(parseTouchLayout(json)));
    const parent = ir2.platforms[0]?.layers[0]?.rows[0]?.keys[0];
    expect(parent?.provenance).toBe("physical-suggested");
    expect(parent?.sk?.[0]?.provenance).toBe("base-derived");
  });

  it("round-trips provenance on multitap sub-keys too", () => {
    // multitap is kept as its own array (not flattened into sk); provenance
    // must survive the full cycle there as well.
    const json = JSON.stringify({
      tablet: {
        layer: [{
          id: "default",
          row: [{
            id: 1,
            key: [{
              id: "K_1", text: "1", p: "base-derived",
              multitap: [{ id: "K_1_MT", text: "!", p: "physical-suggested" }],
            }],
          }],
        }],
      },
    });
    const ir2 = parseTouchLayout(emitTouchLayout(parseTouchLayout(json)));
    const parent = ir2.platforms[0]?.layers[0]?.rows[0]?.keys[0];
    expect(parent?.provenance).toBe("base-derived");
    expect(parent?.multitap?.[0]?.provenance).toBe("physical-suggested");
  });
});

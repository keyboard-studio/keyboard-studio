import { describe, it, expect } from "vitest";
import { parseTouchLayoutString } from "./parseTouchLayout.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal tablet-platform layout JSON with a single key in the
 *  default layer. The `keyProps` object is merged into the raw key. */
function makeLayout(keyProps: Record<string, unknown>): string {
  return JSON.stringify({
    tablet: {
      layer: [
        {
          id: "default",
          row: [{ id: 1, key: [{ id: "K_A", ...keyProps }] }],
        },
      ],
    },
  });
}

function firstKey(json: string) {
  const ir = parseTouchLayoutString(json);
  return ir.platforms[0]!.layers[0]!.rows[0]!.keys[0]!;
}

// ---------------------------------------------------------------------------
// A. flick — compass directions
// ---------------------------------------------------------------------------

describe("parseTouchLayoutString — flick", () => {
  it("maps each FLICK_DIRECTIONS compass direction onto key.flick[dir]", () => {
    const json = makeLayout({
      flick: {
        n:  { id: "K_FN",  text: "north" },
        s:  { id: "K_FS",  text: "south" },
        e:  { id: "K_FE",  text: "east" },
        w:  { id: "K_FW",  text: "west" },
        ne: { id: "K_FNE", text: "northeast" },
        nw: { id: "K_FNW", text: "northwest" },
        se: { id: "K_FSE", text: "southeast" },
        sw: { id: "K_FSW", text: "southwest" },
      },
    });
    const key = firstKey(json);

    expect(key.flick).toBeDefined();
    expect(key.flick!.n?.id).toBe("K_FN");
    expect(key.flick!.n?.text).toBe("north");
    expect(key.flick!.s?.id).toBe("K_FS");
    expect(key.flick!.e?.id).toBe("K_FE");
    expect(key.flick!.w?.id).toBe("K_FW");
    expect(key.flick!.ne?.id).toBe("K_FNE");
    expect(key.flick!.nw?.id).toBe("K_FNW");
    expect(key.flick!.se?.id).toBe("K_FSE");
    expect(key.flick!.sw?.id).toBe("K_FSW");
  });

  it("each flick sub-key is itself a full TouchKeyIR with its own nodeId", () => {
    const json = makeLayout({
      flick: { n: { id: "K_FN", text: "up" } },
    });
    const key = firstKey(json);
    const flickN = key.flick!.n!;

    expect(typeof flickN.nodeId).toBe("string");
    expect(flickN.nodeId.length).toBeGreaterThan(0);
    // The parent key's nodeId must be different from its flick sub-key
    expect(flickN.nodeId).not.toBe(key.nodeId);
  });

  it("ignores unknown flick directions — they are not present on key.flick", () => {
    const json = makeLayout({
      flick: {
        n:   { id: "K_FN", text: "north" },
        xyz: { id: "K_UNKNOWN", text: "bad direction" },
      },
    });
    const key = firstKey(json);

    // Known direction is mapped
    expect(key.flick!.n?.id).toBe("K_FN");
    // Unknown direction must NOT appear on flick
    expect(Object.keys(key.flick!)).not.toContain("xyz");
  });

  it("leaves key.flick undefined when no flick field is present", () => {
    const key = firstKey(makeLayout({}));
    expect(key.flick).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// B. multitap kept SEPARATE from sk — regression guard against the old engine
//    parser that flattened multitap into sk
// ---------------------------------------------------------------------------

describe("parseTouchLayoutString — multitap vs sk separation", () => {
  it("populates key.multitap from the multitap array", () => {
    const json = makeLayout({
      multitap: [
        { id: "K_M1", text: "1" },
        { id: "K_M2", text: "2" },
      ],
    });
    const key = firstKey(json);

    expect(key.multitap).toBeDefined();
    expect(key.multitap!.length).toBe(2);
    expect(key.multitap![0]!.id).toBe("K_M1");
    expect(key.multitap![1]!.id).toBe("K_M2");
  });

  it("populates key.sk from the sk array when multitap is absent", () => {
    const json = makeLayout({
      sk: [
        { id: "K_S1", text: "a" },
        { id: "K_S2", text: "b" },
      ],
    });
    const key = firstKey(json);

    expect(key.sk).toBeDefined();
    expect(key.sk!.length).toBe(2);
    expect(key.multitap).toBeUndefined();
  });

  it("keeps multitap and sk SEPARATE when both are present — multitap is NOT merged into sk", () => {
    // Regression: the legacy engine parser merged multitap into sk; the canonical
    // parser must keep them in distinct fields.
    const json = makeLayout({
      sk: [
        { id: "K_S1", text: "longpress-A" },
      ],
      multitap: [
        { id: "K_T1", text: "tap-1" },
        { id: "K_T2", text: "tap-2" },
      ],
    });
    const key = firstKey(json);

    // sk comes from the sk array
    expect(key.sk).toBeDefined();
    expect(key.sk!.length).toBe(1);
    expect(key.sk![0]!.id).toBe("K_S1");

    // multitap comes from the multitap array and is NOT merged into sk
    expect(key.multitap).toBeDefined();
    expect(key.multitap!.length).toBe(2);
    expect(key.multitap![0]!.id).toBe("K_T1");
    expect(key.multitap![1]!.id).toBe("K_T2");

    // Guarantee: none of the multitap ids appear in sk
    const skIds = key.sk!.map((k) => k.id);
    for (const mt of key.multitap!) {
      expect(skIds, `multitap id "${mt.id}" must not be merged into sk`).not.toContain(mt.id);
    }
  });

  it("multitap sub-keys each get their own nodeId distinct from the parent", () => {
    const json = makeLayout({
      multitap: [{ id: "K_M1", text: "x" }],
    });
    const key = firstKey(json);
    const mt = key.multitap![0]!;

    expect(mt.nodeId).toBeTruthy();
    expect(mt.nodeId).not.toBe(key.nodeId);
  });
});

// ---------------------------------------------------------------------------
// C. pad — numeric coercion from wire string
// ---------------------------------------------------------------------------

describe("parseTouchLayoutString — pad coercion", () => {
  it("coerces pad wire string to a number on the IR key", () => {
    const key = firstKey(makeLayout({ pad: "50" }));
    expect(key.pad).toBe(50);
  });

  it("leaves key.pad undefined when pad is absent", () => {
    const key = firstKey(makeLayout({}));
    expect(key.pad).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// D. toNumber coercion pinning — pins the deliberate unification onto the
//    engine's existing Number() semantics; the lint path previously used
//    parseInt/parseFloat.
// ---------------------------------------------------------------------------

describe("parseTouchLayoutString — toNumber coercion (Number() semantics)", () => {
  it("coerces width string '1.5' to the number 1.5", () => {
    // Number('1.5') === 1.5 — decimal fractions must survive
    const key = firstKey(makeLayout({ width: "1.5" }));
    expect(key.width).toBe(1.5);
  });

  it("drops width '100px' — Number('100px') is NaN so the field is omitted", () => {
    // Pins the deliberate unification onto Number() semantics:
    // the old lint path used parseInt which would have yielded 100 here.
    // Number('100px') → NaN → field dropped to undefined.
    const key = firstKey(makeLayout({ width: "100px" }));
    expect(key.width).toBeUndefined();
  });

  it("coerces width '' (empty string) to undefined — not zero", () => {
    const key = firstKey(makeLayout({ width: "" }));
    expect(key.width).toBeUndefined();
  });

  it("preserves width 0 when supplied as a number", () => {
    // 0 is falsy but Number.isFinite(0) === true — must not be dropped
    const key = firstKey(makeLayout({ width: 0 }));
    expect(key.width).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// E. Error surface — throws on malformed input
// ---------------------------------------------------------------------------

describe("parseTouchLayoutString — error handling", () => {
  it("throws SyntaxError on invalid JSON", () => {
    expect(() => parseTouchLayoutString("not valid json")).toThrow(SyntaxError);
  });

  it("throws TypeError when JSON root is an array", () => {
    expect(() => parseTouchLayoutString("[]")).toThrow(TypeError);
  });

  it("throws TypeError when JSON root is a string", () => {
    expect(() => parseTouchLayoutString('"a string"')).toThrow(TypeError);
  });

  it("throws TypeError when JSON root is null", () => {
    expect(() => parseTouchLayoutString("null")).toThrow(TypeError);
  });
});

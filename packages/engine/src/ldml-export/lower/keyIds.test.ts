import { describe, it, expect } from "vitest";
import {
  KEY_ID_PATTERN,
  MARKER_ID_PATTERN,
  compareCodePoints,
  impliedKeyId,
  layerKeyId,
  markerId,
  markerKeyId,
  outputKeyId,
  resolveIds,
  resolveMarkerIds,
} from "./keyIds.js";

describe("keyIds", () => {
  it("uses implied ids where the output matches", () => {
    expect(impliedKeyId("a")).toBe("a");
    expect(impliedKeyId("Z")).toBe("Z");
    expect(impliedKeyId("7")).toBe("7");
    expect(impliedKeyId(" ")).toBe("space");
    expect(impliedKeyId("é")).toBeUndefined();
    expect(impliedKeyId("ab")).toBeUndefined();
  });

  it("derives u-ids from lowercase hex code points", () => {
    expect(outputKeyId("é")).toBe("ue9");
    expect(outputKeyId("\u{1F600}a")).toBe("u1f600_61");
    expect(outputKeyId("́")).toBe("u301");
  });

  it("derives marker and layer ids that satisfy the patterns", () => {
    for (const s of ["acute", "a b", "x-y", "é", "", "_"]) {
      expect(KEY_ID_PATTERN.test(markerKeyId(s))).toBe(true);
      expect(KEY_ID_PATTERN.test(layerKeyId(s))).toBe(true);
      expect(MARKER_ID_PATTERN.test(markerId(s))).toBe(true);
    }
    expect(markerKeyId("acute")).toBe("m_acute");
    expect(layerKeyId("shift")).toBe("l_shift");
  });

  it("maps markers injectively", () => {
    const names = ["a_b", "a b", "a-b", "a", "A", "_", "", "a__b", "é", "e"];
    const ids = names.map(markerId);
    expect(new Set(ids).size).toBe(names.length);
  });

  it("resolves collisions by code-point order, not input order", () => {
    const reqs = [
      { source: "\u{1F600}", id: "x" },
      { source: "b", id: "x" },
      { source: "Ａ", id: "x" },
      { source: "c", id: "x_2" },
    ];
    const fwd = resolveIds(reqs);
    const rev = resolveIds([...reqs].reverse());
    expect([...fwd.entries()].sort()).toEqual([...rev.entries()].sort());
    expect(fwd.get("b")).toBe("x");
    expect(fwd.get("c")).toBe("x_2");
    expect(fwd.get("Ａ")).toBe("x_3");
    expect(fwd.get("\u{1F600}")).toBe("x_4");
    for (const id of fwd.values()) expect(KEY_ID_PATTERN.test(id)).toBe(true);
    expect(new Set(fwd.values()).size).toBe(fwd.size);
  });

  it("orders by code point, not UTF-16 unit", () => {
    expect(compareCodePoints("\u{1F600}", "Ａ")).toBeGreaterThan(0);
    expect("\u{1F600}" < "Ａ").toBe(true);
  });

  it("keeps resolved marker ids within 32 characters and unique", () => {
    const long = ["m".repeat(40), "m".repeat(41), "m".repeat(32)];
    const out = resolveMarkerIds(long);
    expect(new Set(out.values()).size).toBe(3);
    for (const id of out.values()) expect(MARKER_ID_PATTERN.test(id)).toBe(true);
  });
});

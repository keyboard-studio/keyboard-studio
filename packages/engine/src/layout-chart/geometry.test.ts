import { describe, it, expect } from "vitest";
import {
  DESKTOP_GEOMETRY,
  DESKTOP_GEOMETRY_ISO,
  DESKTOP_GEOMETRY_WIDTH,
  DESKTOP_ROW_BOTTOM,
} from "./geometry.js";

describe("DESKTOP_GEOMETRY_ISO", () => {
  it("leaves the ANSI table without a 102nd key", () => {
    expect(DESKTOP_GEOMETRY.some((k) => k.id === "K_oE2")).toBe(false);
  });

  it("places K_oE2 between Left Shift and K_Z, flush on the bottom row", () => {
    const bottom = DESKTOP_GEOMETRY_ISO.filter((k) => k.row === DESKTOP_ROW_BOTTOM).sort(
      (a, b) => a.x - b.x,
    );
    expect(bottom.slice(0, 3).map((k) => k.id)).toEqual(["K_SHIFT", "K_oE2", "K_Z"]);
    let edge = 0;
    for (const k of bottom) {
      expect(k.x).toBeCloseTo(edge);
      edge += k.width;
    }
    expect(edge).toBeCloseTo(DESKTOP_GEOMETRY_WIDTH);
  });

  it("is identical to ANSI outside the bottom row's Left Shift / K_oE2", () => {
    const ansi = DESKTOP_GEOMETRY.filter((k) => k.id !== "K_SHIFT");
    const iso = DESKTOP_GEOMETRY_ISO.filter((k) => k.id !== "K_SHIFT" && k.id !== "K_oE2");
    expect(iso).toEqual(ansi);
  });
});

import { describe, expect, it } from "vitest";
import {
  DESKTOP_GEOMETRY,
  DESKTOP_GEOMETRY_ISO,
  DESKTOP_GEOMETRY_WIDTH,
  DESKTOP_ISO_GEOMETRY,
  DESKTOP_ISO_ROW_SPACE,
  FORM_ROWS,
  isFrameKey,
} from "./index.js";
import { DESKTOP_ROW_BOTTOM } from "./geometry.js";
import * as positions from "../ldml-export/lower/positions.js";

const byId = new Map(DESKTOP_ISO_GEOMETRY.map((k) => [k.id, k]));

describe("DESKTOP_ISO_GEOMETRY", () => {
  it("has the ISO-only K_oE2 key on the bottom row", () => {
    expect(byId.get("K_oE2")).toMatchObject({ row: 3, frame: false });
  });

  it("has a space row holding K_SPACE", () => {
    expect(byId.get("K_SPACE")).toMatchObject({ row: DESKTOP_ISO_ROW_SPACE, frame: false });
  });

  it.each(["K_BKSP", "K_ENTER", "K_TAB"])("flags %s as a frame key", (id) => {
    expect(byId.get(id)?.frame).toBe(true);
  });

  it.each(["K_LEFT", "K_RIGHT", "K_UP", "K_DOWN"])("isFrameKey flags arrow %s", (id) => {
    expect(isFrameKey(id)).toBe(true);
  });

  it("flags exactly the keys outside the ISO layout block", () => {
    const block = new Set(FORM_ROWS.iso.flatMap((row) => row.map((cell) => cell.vkey)));
    for (const key of DESKTOP_ISO_GEOMETRY) {
      expect(key.frame, key.id).toBe(!block.has(key.id));
    }
  });

  it("covers every ISO layout-block key exactly once", () => {
    const ids = DESKTOP_ISO_GEOMETRY.map((k) => k.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const row of FORM_ROWS.iso) {
      for (const cell of row) expect(byId.has(cell.vkey), cell.vkey).toBe(true);
    }
  });

  it("keeps non-space rows within the grid width and rows non-overlapping", () => {
    for (let row = 0; row < DESKTOP_ISO_ROW_SPACE; row++) {
      const keys = DESKTOP_ISO_GEOMETRY.filter((k) => k.row === row);
      let edge = 0;
      for (const k of keys) {
        expect(k.x, k.id).toBe(edge);
        edge = k.x + k.width;
      }
      expect(edge).toBeLessThanOrEqual(DESKTOP_GEOMETRY_WIDTH);
    }
  });
});

describe("DESKTOP_GEOMETRY (ANSI)", () => {
  it("is unchanged: four rows, no K_oE2, no space row", () => {
    expect(new Set(DESKTOP_GEOMETRY.map((k) => k.row))).toEqual(new Set([0, 1, 2, 3]));
    expect(DESKTOP_GEOMETRY.some((k) => k.id === "K_oE2" || k.id === "K_SPACE")).toBe(false);
    expect(DESKTOP_GEOMETRY).toHaveLength(14 + 14 + 13 + 12);
  });
});

describe("shared form tables", () => {
  it("positions.ts re-exports the geometry copy, not a second one", () => {
    expect(positions.FORM_ROWS).toBe(FORM_ROWS);
    expect(positions.isFrameKey).toBe(isFrameKey);
  });
});

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

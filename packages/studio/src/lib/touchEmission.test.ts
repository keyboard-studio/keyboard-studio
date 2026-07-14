// touchEmission tests (spec 035 T012) — pins every row of the R11 emission
// matrix (research.md R11 / contracts/seed-derivation.md "Emission policy").

import { describe, it, expect } from "vitest";
import type { DesktopModifications } from "@keyboard-studio/engine";
import { shouldEmitTouchLayout, resolveTouchSeedSource } from "./touchEmission.ts";

const EMPTY_MODS: DesktopModifications = { removals: [], placements: [] };
const NON_EMPTY_REMOVALS: DesktopModifications = { removals: ["x"], placements: [] };
const NON_EMPTY_PLACEMENTS: DesktopModifications = {
  removals: [],
  placements: [{ char: "y", hostKey: "K_Y" }],
};

describe("shouldEmitTouchLayout — R11 matrix", () => {
  it("reseed-from-desktop always emits, even with empty mods and no real edits", () => {
    expect(shouldEmitTouchLayout("reseed-from-desktop", EMPTY_MODS, false)).toBe(true);
  });

  it("reseed-from-desktop always emits, with non-empty mods and real edits too", () => {
    expect(shouldEmitTouchLayout("reseed-from-desktop", NON_EMPTY_REMOVALS, true)).toBe(true);
  });

  it("import-adapt with non-empty removals (no real edit) emits", () => {
    expect(shouldEmitTouchLayout("import-adapt", NON_EMPTY_REMOVALS, false)).toBe(true);
  });

  it("import-adapt with non-empty placements (no real edit) emits", () => {
    expect(shouldEmitTouchLayout("import-adapt", NON_EMPTY_PLACEMENTS, false)).toBe(true);
  });

  it("import-adapt with empty mods but a real edit emits", () => {
    expect(shouldEmitTouchLayout("import-adapt", EMPTY_MODS, true)).toBe(true);
  });

  it("import-adapt with empty mods and no real edit emits NOTHING (truly-untouched no-op)", () => {
    expect(shouldEmitTouchLayout("import-adapt", EMPTY_MODS, false)).toBe(false);
  });

  it("import-adapt with non-empty mods AND a real edit emits (both conditions true)", () => {
    expect(shouldEmitTouchLayout("import-adapt", NON_EMPTY_REMOVALS, true)).toBe(true);
  });
});

describe("resolveTouchSeedSource — Entity-5 default fallback", () => {
  it("returns the stored choice unchanged when non-null, regardless of base layout presence", () => {
    expect(resolveTouchSeedSource("import-adapt", false)).toBe("import-adapt");
    expect(resolveTouchSeedSource("reseed-from-desktop", true)).toBe("reseed-from-desktop");
  });

  it("defaults to import-adapt when null and the base ships a usable touch layout", () => {
    expect(resolveTouchSeedSource(null, true)).toBe("import-adapt");
  });

  it("defaults to reseed-from-desktop when null and the base ships no touch layout", () => {
    expect(resolveTouchSeedSource(null, false)).toBe("reseed-from-desktop");
  });
});

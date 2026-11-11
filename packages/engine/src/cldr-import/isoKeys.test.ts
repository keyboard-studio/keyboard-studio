// ISO position → vkey mapping + `modifiers` expansion (issue #2599).

import { describe, it, expect } from "vitest";
import {
  isoToVkey,
  formForLocale,
  expandModifiers,
} from "./isoKeys.js";

describe("isoToVkey", () => {
  it("maps the main-block positions (German windows file)", () => {
    expect(isoToVkey("E00")).toBe("K_BKQUOTE");
    expect(isoToVkey("E01")).toBe("K_1");
    expect(isoToVkey("E10")).toBe("K_0");
    expect(isoToVkey("E11")).toBe("K_HYPHEN");
    expect(isoToVkey("E12")).toBe("K_EQUAL");
    expect(isoToVkey("D01")).toBe("K_Q");
    expect(isoToVkey("D12")).toBe("K_RBRKT");
    expect(isoToVkey("C01")).toBe("K_A");
    expect(isoToVkey("C11")).toBe("K_QUOTE");
    expect(isoToVkey("B00")).toBe("K_oE2");
    expect(isoToVkey("B01")).toBe("K_Z");
    expect(isoToVkey("B10")).toBe("K_SLASH");
    expect(isoToVkey("A03")).toBe("K_SPACE");
  });

  it("maps the backslash position on both forms (D13 US, C12 ISO)", () => {
    expect(isoToVkey("D13")).toBe("K_BKSLASH");
    expect(isoToVkey("C12")).toBe("K_BKSLASH");
  });

  it("leaves touch-only positions unmapped", () => {
    for (const iso of ["A00", "A01", "A02", "A04", "A05", "B12", "C13"]) {
      expect(isoToVkey(iso)).toBeUndefined();
    }
  });

  it("maps form-dependent positions only with the form", () => {
    // B11: ABNT2 extra on pt, JIS extra on ja (same scan 0x73).
    expect(isoToVkey("B11")).toBeUndefined();
    expect(isoToVkey("B11", "abnt2")).toBe("K_oC1");
    expect(isoToVkey("B11", "jis")).toBe("K_oE1");
    // E13: JIS number-row extra.
    expect(isoToVkey("E13")).toBeUndefined();
    expect(isoToVkey("E13", "jis")).toBe("K_oE0");
    expect(isoToVkey("E13", "abnt2")).toBeUndefined();
  });

  it("is case-insensitive", () => {
    expect(isoToVkey("d01")).toBe("K_Q");
  });
});

describe("formForLocale", () => {
  it("names the regional form for pt and ja only", () => {
    expect(formForLocale("pt-t-k0-windows")).toBe("abnt2");
    expect(formForLocale("ja-t-k0-windows")).toBe("jis");
    expect(formForLocale("de-t-k0-windows")).toBeUndefined();
    expect(formForLocale("en-t-k0-windows")).toBeUndefined();
  });
});

describe("expandModifiers", () => {
  it("treats a missing attribute as the base layer", () => {
    expect(expandModifiers(undefined)).toEqual({ sets: [[]], skipped: [] });
    expect(expandModifiers("")).toEqual({ sets: [[]], skipped: [] });
  });

  it("expands a single combination", () => {
    expect(expandModifiers("shift")).toEqual({ sets: [["SHIFT"]], skipped: [] });
    expect(expandModifiers("caps+shift")).toEqual({
      sets: [["SHIFT", "CAPS"]],
      skipped: [],
    });
    expect(expandModifiers("altR")).toEqual({ sets: [["RALT"]], skipped: [] });
    expect(expandModifiers("opt")).toEqual({ sets: [["RALT"]], skipped: [] });
    expect(expandModifiers("optL")).toEqual({ sets: [["LALT"]], skipped: [] });
    expect(expandModifiers("ctrlL")).toEqual({ sets: [["LCTRL"]], skipped: [] });
  });

  it("expands space-separated alternatives", () => {
    expect(expandModifiers("altR+caps? ctrl+alt+caps?")).toEqual({
      sets: [["RALT"], ["CTRL", "ALT"]],
      skipped: [],
    });
  });

  it("drops optional tokens (a rule with no caps flag fires either way)", () => {
    expect(expandModifiers("shift+caps?")).toEqual({
      sets: [["SHIFT"]],
      skipped: [],
    });
    expect(expandModifiers("caps?")).toEqual({ sets: [[]], skipped: [] });
  });

  it("treats Android's space-separated shift+caps as two alternatives", () => {
    expect(expandModifiers("shift caps")).toEqual({
      sets: [["SHIFT"], ["CAPS"]],
      skipped: [],
    });
  });

  it("skips alternatives containing cmd, keeping the rest", () => {
    expect(expandModifiers("caps cmd+opt+caps?")).toEqual({
      sets: [["CAPS"]],
      skipped: ["cmd+opt+caps?"],
    });
    expect(expandModifiers("cmd")).toEqual({ sets: [], skipped: ["cmd"] });
  });

  it("dedupes alternatives that collapse to the same set", () => {
    expect(expandModifiers("shift shift+caps?")).toEqual({
      sets: [["SHIFT"]],
      skipped: [],
    });
  });
});

// layerList — the selector's list and the Add layer checks (spec 113 FR-010, FR-010a).

import { describe, expect, it } from "vitest";
import { parseKmn } from "@keyboard-studio/engine";
import {
  DEFAULT_LAYER_KEY,
  canonicalLayer,
  isSystemShortcutLayer,
  isUnsavedLayer,
  layerKey,
  listAvailableLayers,
} from "./layerList.ts";

const HEAD = `store(&VERSION) '10.0'
store(&NAME) 'T'
begin Unicode > use(main)
group(main) using keys
+ [K_A] > 'a'
`;

const plain = parseKmn(HEAD, "t").ir;
const withAltGr = parseKmn(`${HEAD}+ [RALT K_A] > 'ä'\n`, "t").ir;
const withShiftAltGr = parseKmn(`${HEAD}+ [SHIFT RALT K_A] > 'Ä'\n`, "t").ir;
const withCtrl = parseKmn(`${HEAD}+ [CTRL K_A] > 'x'\n`, "t").ir;

const keys = (layers: readonly (readonly string[])[]): string[] => layers.map((l) => layerKey(l as never));

describe("layerKey", () => {
  it("names the empty combination default and joins tokens otherwise", () => {
    expect(layerKey([])).toBe(DEFAULT_LAYER_KEY);
    expect(layerKey(["SHIFT", "RALT"])).toBe("SHIFT+RALT");
  });
});

describe("canonicalLayer", () => {
  it("orders and deduplicates tokens", () => {
    expect(canonicalLayer(["RALT", "SHIFT", "SHIFT"])).toEqual(canonicalLayer(["SHIFT", "RALT"]));
  });

  it("returns null for two tokens of one family", () => {
    expect(canonicalLayer(["CTRL", "LCTRL"])).toBeNull();
  });
});

describe("listAvailableLayers", () => {
  it("always lists default and Shift, even for a keyboard with neither", () => {
    expect(keys(listAvailableLayers(plain, plain))).toEqual(["default", "SHIFT"]);
    expect(keys(listAvailableLayers(null, null))).toEqual(["default", "SHIFT"]);
  });

  it("adds every layer the starting point or the working copy uses, once", () => {
    const k = keys(listAvailableLayers(withAltGr, withShiftAltGr));
    expect(k.slice(0, 2)).toEqual(["default", "SHIFT"]);
    expect(k).toContain("RALT");
    expect(k.filter((x) => x === "SHIFT+RALT" || x === "RALT+SHIFT")).toHaveLength(1);
    expect(new Set(k).size).toBe(k.length);
  });

  it("lists a layer only the starting point uses", () => {
    expect(keys(listAvailableLayers(withAltGr, plain))).toContain("RALT");
  });

  it("appends session-added layers, deduplicated against the rest however they are spelled", () => {
    const k = keys(listAvailableLayers(withAltGr, withAltGr, [["RALT"], ["CAPS"], ["CAPS"]]));
    expect(k.filter((x) => x === "RALT")).toHaveLength(1);
    expect(k.filter((x) => x === "CAPS")).toHaveLength(1);
    expect(k[k.length - 1]).toBe("CAPS");
  });
});

describe("isUnsavedLayer", () => {
  it("is true for an added layer with no rule, false once the working copy has one", () => {
    expect(isUnsavedLayer(["RALT"], plain)).toBe(true);
    expect(isUnsavedLayer(["RALT"], withAltGr)).toBe(false);
  });

  it("is never true for default or Shift", () => {
    expect(isUnsavedLayer([], plain)).toBe(false);
    expect(isUnsavedLayer(["SHIFT"], plain)).toBe(false);
  });
});

describe("isSystemShortcutLayer (FR-010a)", () => {
  it("flags Ctrl or Alt without AltGr", () => {
    expect(isSystemShortcutLayer(["CTRL"])).toBe(true);
    expect(isSystemShortcutLayer(["ALT"])).toBe(true);
    expect(isSystemShortcutLayer(["SHIFT", "LCTRL"])).toBe(true);
    expect(isSystemShortcutLayer(["RCTRL"])).toBe(true);
  });

  it("does not flag AltGr, Shift, Caps, or none", () => {
    expect(isSystemShortcutLayer(["RALT"])).toBe(false);
    expect(isSystemShortcutLayer(["LCTRL", "LALT"])).toBe(false);
    expect(isSystemShortcutLayer(["SHIFT"])).toBe(false);
    expect(isSystemShortcutLayer(["CAPS"])).toBe(false);
    expect(isSystemShortcutLayer([])).toBe(false);
  });

  it("lists a Ctrl layer a keyboard uses", () => {
    expect(keys(listAvailableLayers(withCtrl, withCtrl))).toContain("CTRL");
  });
});

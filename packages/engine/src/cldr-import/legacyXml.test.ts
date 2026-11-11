// Legacy CLDR XML parser (issue #2599).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  parseCldrLegacyKeyboard,
  decodeCldrValue,
} from "./legacyXml.js";

const here = dirname(fileURLToPath(import.meta.url));
const readFixture = (name: string): string =>
  readFileSync(resolve(here, "__fixtures__", name), "utf8");

describe("decodeCldrValue", () => {
  it("decodes XML entities", () => {
    expect(decodeCldrValue("&lt;&gt;&quot;&apos;&amp;")).toBe("<>\"'&");
  });

  it("decodes \\u{...} escapes", () => {
    expect(decodeCldrValue("\\u{22}")).toBe('"');
    expect(decodeCldrValue("\\u{A0}")).toBe(" ");
  });

  it("decodes numeric character references", () => {
    expect(decodeCldrValue("&#x22;")).toBe('"');
    expect(decodeCldrValue("&#34;")).toBe('"');
  });
});

describe("parseCldrLegacyKeyboard — de windows fixture", () => {
  const parsed = parseCldrLegacyKeyboard(readFixture("de-t-k0-windows.xml"));

  it("reads locale, name and platform", () => {
    expect(parsed.locale).toBe("de-t-k0-windows");
    expect(parsed.name).toBe("German");
    expect(parsed.platform).toBe("10");
  });

  it("reads all keyMaps with their modifiers", () => {
    const modifiers = parsed.keyMaps.map((k) => k.modifiers);
    expect(modifiers).toContain(undefined); // base layer
    expect(modifiers).toContain("shift");
    expect(modifiers).toContain("caps");
    expect(modifiers).toContain("caps+shift");
    const base = parsed.keyMaps.find((k) => k.modifiers === undefined);
    expect(base?.maps.length).toBeGreaterThan(40);
    expect(base?.maps.find((m) => m.iso === "D01")).toEqual({
      iso: "D01",
      to: "q",
    });
    expect(base?.maps.find((m) => m.iso === "E00")?.to).toBe("^");
  });

  it("decodes escaped `to` values", () => {
    const shift = parsed.keyMaps.find((k) => k.modifiers === "shift");
    expect(shift?.maps.find((m) => m.iso === "E02")?.to).toBe('"');
  });

  it("reads the simple transforms (dead-key sequences)", () => {
    expect(parsed.transforms.length).toBeGreaterThan(30);
    expect(parsed.transforms).toContainEqual({ from: "^a", to: "â" });
    expect(parsed.transforms).toContainEqual({ from: "^ ", to: "^" });
    expect(parsed.transforms).toContainEqual({ from: "´e", to: "é" });
    expect(parsed.skippedTransformTypes).toEqual([]);
  });
});

describe("parseCldrLegacyKeyboard — de android fixture", () => {
  const parsed = parseCldrLegacyKeyboard(readFixture("de-t-k0-android.xml"));

  it("reads longPress lists", () => {
    const base = parsed.keyMaps.find((k) => k.modifiers === undefined);
    expect(base?.maps.find((m) => m.iso === "D03")?.longPress).toBe(
      "é è ê ë ė",
    );
    expect(base?.maps.find((m) => m.iso === "D01")?.longPress).toBeUndefined();
  });

  it("reads the opt symbol layers", () => {
    const modifiers = parsed.keyMaps.map((k) => k.modifiers);
    expect(modifiers).toContain("opt");
    expect(modifiers).toContain("opt+shift");
    expect(modifiers).toContain("shift caps");
    const opt = parsed.keyMaps.find((k) => k.modifiers === "opt");
    expect(opt?.maps.find((m) => m.iso === "D01")?.to).toBe("1");
  });
});

describe("parseCldrLegacyKeyboard — errors", () => {
  it("throws when the keyboard element or locale is missing", () => {
    expect(() => parseCldrLegacyKeyboard("<keyboard></keyboard>")).toThrow(
      /locale/,
    );
    expect(() => parseCldrLegacyKeyboard("<foo/>")).toThrow(/<keyboard>/);
  });

  it("throws when there are no keyMaps", () => {
    expect(() =>
      parseCldrLegacyKeyboard('<keyboard locale="xx-t-k0-windows"></keyboard>'),
    ).toThrow(/no <keyMap>/);
  });

  it("records non-simple transform types instead of parsing them", () => {
    const parsed = parseCldrLegacyKeyboard(
      `<keyboard locale="xx-t-k0-windows">
         <keyMap><map iso="D01" to="q"/></keyMap>
         <transforms type="backspace"><transform from="a" to=""/></transforms>
       </keyboard>`,
    );
    expect(parsed.transforms).toEqual([]);
    expect(parsed.skippedTransformTypes).toEqual(["backspace"]);
  });

  it("reads transform=no and multitap attributes", () => {
    const parsed = parseCldrLegacyKeyboard(
      `<keyboard locale="xx-t-k0-windows">
         <keyMap>
           <map iso="D01" to="q" transform="no"/>
           <map iso="D02" to="w" multitap="w v"/>
         </keyMap>
       </keyboard>`,
    );
    const maps = parsed.keyMaps[0]?.maps;
    expect(maps?.[0]?.transformNo).toBe(true);
    expect(maps?.[1]?.multitap).toBe("w v");
  });
});

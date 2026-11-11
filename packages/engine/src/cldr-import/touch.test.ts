// Android CLDR → touch layout (issue #2599).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseCldrLegacyKeyboard } from "./legacyXml.js";
import {
  importCldrTouchLayout,
  makeDesktopTouchResolver,
  unicodeKeyIdFor,
} from "./touch.js";

const here = dirname(fileURLToPath(import.meta.url));
const readFixture = (name: string): string =>
  readFileSync(resolve(here, "__fixtures__", name), "utf8");

function importDeTouch() {
  const android = parseCldrLegacyKeyboard(readFixture("de-t-k0-android.xml"));
  const desktop = parseCldrLegacyKeyboard(readFixture("de-t-k0-windows.xml"));
  return importCldrTouchLayout(android, {
    platform: "phone",
    resolver: makeDesktopTouchResolver(desktop),
  });
}

function findKey(
  layout: ReturnType<typeof importDeTouch>["touchLayout"],
  layerId: string,
  keyId: string,
) {
  const layer = layout.platforms[0]?.layers.find((l) => l.id === layerId);
  return layer?.rows.flatMap((r) => r.keys).find((k) => k.id === keyId);
}

describe("importCldrTouchLayout — de android fixture", () => {
  const { touchLayout, report } = importDeTouch();

  it("builds the four layers from the four keyMaps", () => {
    expect(report.layers).toEqual(["default", "shift", "symbol", "symbol-shift"]);
    expect(touchLayout.platforms).toHaveLength(1);
    expect(touchLayout.platforms[0]?.id).toBe("phone");
    expect(report.skipped).toEqual([]);
    expect(report.skippedKeyMaps).toEqual([]);
  });

  it("lays out rows in ISO row order", () => {
    const def = touchLayout.platforms[0]?.layers.find((l) => l.id === "default");
    expect(def?.rows.map((r) => r.keys[0]?.id)).toEqual([
      "K_Q",
      "K_A",
      "K_Z",
      "U_002C",
    ]);
  });

  it("gives letter keys the K_ id of their ISO position", () => {
    expect(findKey(touchLayout, "default", "K_Q")?.text).toBe("q");
    expect(findKey(touchLayout, "shift", "K_Q")?.text).toBe("Q");
    expect(findKey(touchLayout, "default", "K_SPACE")?.text).toBe(" ");
  });

  it("gives symbol-layer keys U_ ids (no desktop rule produces them)", () => {
    // opt D01 is "1": the desktop K_Q rule types "q", so the key is U_0031.
    expect(findKey(touchLayout, "symbol", "U_0031")?.text).toBe("1");
    expect(findKey(touchLayout, "symbol", "U_20AC")?.text).toBe("€");
    expect(findKey(touchLayout, "symbol", "K_Q")).toBeUndefined();
  });

  it("turns longPress lists into sk subkeys", () => {
    const e = findKey(touchLayout, "default", "K_E");
    expect(e?.sk?.map((s) => s.text)).toEqual(["é", "è", "ê", "ë", "ė"]);
    expect(e?.sk?.map((s) => s.id)).toEqual([
      "U_00E9",
      "U_00E8",
      "U_00EA",
      "U_00EB",
      "U_0117",
    ]);
    // A longPress char the desktop already types reuses its K_ id:
    // "." longPress includes "," which the desktop B08 rule types.
    const period = findKey(touchLayout, "default", "U_002E");
    expect(period?.sk?.map((s) => s.id)).toContain("K_COMMA");
  });

  it("keeps space-row neighbour keys as U_ keys (A02/A04)", () => {
    expect(findKey(touchLayout, "default", "U_002C")?.text).toBe(",");
    expect(findKey(touchLayout, "default", "U_002E")?.text).toBe(".");
  });

  it("counts keys and subkeys in the report", () => {
    expect(report.keys).toBeGreaterThan(80);
    expect(report.longpressSubkeys).toBeGreaterThan(40);
  });
});

describe("unicodeKeyIdFor", () => {
  it("encodes single and multi-codepoint strings", () => {
    expect(unicodeKeyIdFor("é")).toBe("U_00E9");
    expect(unicodeKeyIdFor("SS")).toBe("U_0053_0053");
    expect(unicodeKeyIdFor("€")).toBe("U_20AC");
  });
});

describe("importCldrTouchLayout — standalone (no desktop resolver)", () => {
  it("falls back to U_ ids for every key", () => {
    const android = parseCldrLegacyKeyboard(readFixture("de-t-k0-android.xml"));
    const { touchLayout } = importCldrTouchLayout(android, { platform: "phone" });
    expect(findKey(touchLayout, "default", "U_0071")?.text).toBe("q");
  });

  it("maps multitap lists the same way as longPress", () => {
    const android = parseCldrLegacyKeyboard(
      `<keyboard locale="xx-t-k0-android">
         <keyMap>
           <map iso="D01" to="q" multitap="q v"/>
         </keyMap>
       </keyboard>`,
    );
    const { touchLayout, report } = importCldrTouchLayout(android, {
      platform: "phone",
    });
    const q = findKey(touchLayout, "default", "U_0071");
    expect(q?.multitap?.map((s) => s.text)).toEqual(["q", "v"]);
    expect(report.multitapSubkeys).toBe(2);
  });
});

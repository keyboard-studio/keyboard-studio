import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseTouchLayout, emitTouchLayout } from "../codec/parse-touch.js";
import { syncTouchCapsLayer, syncTouchCapsLayerRaw } from "./syncTouchCapsLayer.js";

const fx = (p: string) =>
  readFileSync(new URL(`./__fixtures__/${p}`, import.meta.url), "utf8");

const FIXTURES = [
  "upstream_basic_kbdus/basic_kbdus.keyman-touch-layout",
  "touch/caps_missing_letters.keyman-touch-layout",
  "touch/caps_no_doubletap.keyman-touch-layout",
];

type RawKey = { id: string; text?: string; nextlayer?: string; multitap?: Array<{ id: string; nextlayer?: string }> };
type RawLayer = { id: string; row: Array<{ key: RawKey[] }> };
type Raw = Record<string, { layer: RawLayer[] }>;

const layerOf = (raw: Raw, id: string) => raw["tablet"]!.layer.find((l) => l.id === id);
const keysOf = (l: RawLayer | undefined) => (l?.row ?? []).flatMap((r) => r.key);

/** The structural contract the lint check (18.16) enforces, restated without importing lint. */
function assertComplete(json: string): void {
  const raw = JSON.parse(json) as Raw;
  const def = keysOf(layerOf(raw, "default"));
  const caps = keysOf(layerOf(raw, "caps"));
  expect(caps.length).toBeGreaterThan(0);
  const shift = def.find((k) => k.id === "K_SHIFT");
  expect(shift?.multitap?.some((m) => m.nextlayer === "caps")).toBe(true);
  for (const k of def.filter((k) => /^[a-z]$/.test(k.text ?? ""))) {
    expect(caps.find((c) => c.id === k.id)?.text).toBe((k.text ?? "").toUpperCase());
  }
  const frame = new Set(["K_SHIFT", "K_LOPT", "K_BKSP", "K_ENTER", "K_SPACE", "K_SYMBOLS", "K_RALT"]);
  expect(caps.filter((k) => k.nextlayer !== undefined && !frame.has(k.id))).toEqual([]);
}

describe("syncTouchCapsLayerRaw", () => {
  for (const f of FIXTURES) {
    it(`${f}: result is a complete caps layer`, () => {
      assertComplete(syncTouchCapsLayerRaw(fx(f), { bcp47: "en" }).json);
    });
  }

  it("idempotent: a second run changes nothing", () => {
    for (const f of FIXTURES) {
      const once = syncTouchCapsLayerRaw(fx(f), { bcp47: "en" });
      const twice = syncTouchCapsLayerRaw(once.json, { bcp47: "en" });
      expect(twice.changed).toBe(false);
      expect(twice.json).toBe(once.json);
    }
  });

  it("leaves keys outside the caps layer, and the default K_SHIFT's own fields, untouched", () => {
    const input = fx("touch/caps_no_doubletap.keyman-touch-layout");
    const before = JSON.parse(input) as Raw;
    const after = JSON.parse(syncTouchCapsLayerRaw(input, { bcp47: "en" }).json) as Raw;
    for (const l of before["tablet"]!.layer.filter((l) => l.id !== "caps")) {
      const a = layerOf(after, l.id)!;
      for (const k of keysOf(l)) {
        const k2 = keysOf(a).find((x) => x.id === k.id)!;
        if (l.id === "default" && k.id === "K_SHIFT") {
          expect({ ...k2, multitap: undefined }).toEqual({ ...k, multitap: undefined });
        } else {
          expect(k2).toEqual(k);
        }
      }
    }
  });

  it("adds the double-tap on a layout that lacks it", () => {
    const out = JSON.parse(
      syncTouchCapsLayerRaw(fx("touch/caps_no_doubletap.keyman-touch-layout"), { bcp47: "en" }).json,
    ) as Raw;
    const shift = keysOf(layerOf(out, "default")).find((k) => k.id === "K_SHIFT")!;
    expect(shift.multitap).toEqual([{ id: "T_CAPS", text: "*ShiftLock*", nextlayer: "caps" }]);
  });

  it("creates the caps layer from shift when absent (upstream basic_kbdus)", () => {
    const out = JSON.parse(
      syncTouchCapsLayerRaw(fx("upstream_basic_kbdus/basic_kbdus.keyman-touch-layout"), { bcp47: "en" }).json,
    ) as Raw;
    expect(layerOf(out, "caps")).toBeDefined();
    expect(keysOf(layerOf(out, "caps")).find((k) => k.id === "K_Q")?.text).toBe("Q");
  });

  it("leaves rightalt-caps untouched", () => {
    const raw = JSON.parse(fx("touch/caps_missing_letters.keyman-touch-layout")) as Raw;
    raw["tablet"]!.layer.push({
      id: "rightalt-caps",
      row: [{ key: [{ id: "K_Q", text: "Q", nextlayer: "default" }] }],
    });
    const out = JSON.parse(syncTouchCapsLayerRaw(JSON.stringify(raw), { bcp47: "en" }).json) as Raw;
    expect(layerOf(out, "rightalt-caps")).toEqual(layerOf(raw, "rightalt-caps"));
  });

  it("returns the input string unchanged when nothing needs doing", () => {
    const once = syncTouchCapsLayerRaw(fx("touch/caps_no_doubletap.keyman-touch-layout"), { bcp47: "en" });
    expect(syncTouchCapsLayerRaw(once.json, { bcp47: "en" }).json).toBe(once.json);
  });

  it("a letter placed on default gets its uppercase on caps when shift is empty", () => {
    const raw = JSON.parse(fx("touch/caps_missing_letters.keyman-touch-layout")) as Raw;
    keysOf(layerOf(raw, "default")).find((k) => k.id === "K_P")!.text = "ŋ";
    keysOf(layerOf(raw, "shift")).find((k) => k.id === "K_P")!.text = "";
    const out = JSON.parse(syncTouchCapsLayerRaw(JSON.stringify(raw), { bcp47: "en" }).json) as Raw;
    expect(keysOf(layerOf(out, "caps")).find((k) => k.id === "K_P")?.text).toBe("Ŋ");
  });
});

describe("syncTouchCapsLayer (IR form)", () => {
  it("gives a complete layout and does not mutate the input", () => {
    const text = fx("touch/caps_missing_letters.keyman-touch-layout");
    const ir = parseTouchLayout(text);
    const snapshot = JSON.stringify(ir);
    const res = syncTouchCapsLayer(ir, { bcp47: "en" });
    expect(JSON.stringify(ir)).toBe(snapshot);
    expect(res.changed).toBe(true);
    assertComplete(emitTouchLayout(res.layout));
  });
});

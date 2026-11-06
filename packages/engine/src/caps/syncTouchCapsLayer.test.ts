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

  it("leaves the default layer, and every key's output, untouched", () => {
    const input = fx("touch/caps_no_doubletap.keyman-touch-layout");
    const before = JSON.parse(input) as Raw;
    const after = JSON.parse(syncTouchCapsLayerRaw(input, { bcp47: "en" }).json) as Raw;
    for (const l of before["tablet"]!.layer.filter((l) => l.id !== "caps")) {
      const a = layerOf(after, l.id)!;
      for (const k of keysOf(l)) {
        const k2 = keysOf(a).find((x) => x.id === k.id)!;
        if (l.id === "default") {
          expect({ ...k2, multitap: undefined }).toEqual({ ...k, multitap: undefined });
        } else {
          // Other layers only gain one-shot nextlayer and Shift's label.
          expect({ ...k2, nextlayer: undefined, text: undefined }).toEqual({ ...k, nextlayer: undefined, text: undefined });
          if (k.id !== "K_SHIFT") expect(k2.text).toBe(k.text);
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

  it("keeps the character keys of an existing rightalt-caps on that layer", () => {
    const raw = JSON.parse(fx("touch/caps_missing_letters.keyman-touch-layout")) as Raw;
    raw["tablet"]!.layer.push({
      id: "rightalt-caps",
      row: [{ key: [{ id: "K_Q", text: "Q", nextlayer: "default" }] }],
    });
    const out = JSON.parse(syncTouchCapsLayerRaw(JSON.stringify(raw), { bcp47: "en" }).json) as Raw;
    expect(keysOf(layerOf(out, "rightalt-caps"))).toEqual([{ id: "K_Q", text: "Q" }]);
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

describe("syncTouchCapsLayerRaw full Capsifesto behaviour", () => {
  /** caps_missing_letters plus rightalt / ctrl layers cloned from default and shift. */
  function withModifierLayers(): Raw {
    const raw = JSON.parse(fx("touch/caps_missing_letters.keyman-touch-layout")) as Raw;
    const clone = (id: string, from: string) => {
      const layer = { ...(JSON.parse(JSON.stringify(layerOf(raw, from))) as RawLayer), id };
      for (const k of keysOf(layer)) delete k.multitap;
      raw["tablet"]!.layer.push(layer);
    };
    clone("rightalt", "default");
    clone("rightalt-shift", "shift");
    clone("ctrl", "default");
    clone("ctrl-shift", "shift");
    return raw;
  }
  const run = (raw: Raw): Raw =>
    JSON.parse(syncTouchCapsLayerRaw(JSON.stringify(raw), { bcp47: "en" }).json) as Raw;

  it("builds rightalt-caps and ctrl-caps from their shift layers", () => {
    const out = run(withModifierLayers());
    for (const id of ["rightalt-caps", "ctrl-caps"]) {
      expect(layerOf(out, id)).toBeDefined();
      expect(keysOf(layerOf(out, id)).length).toBe(keysOf(layerOf(out, id.replace("caps", "shift"))).length);
    }
  });

  it("double-tapping Shift on rightalt and ctrl reaches their caps layers", () => {
    const out = run(withModifierLayers());
    const tap = (layer: string) =>
      keysOf(layerOf(out, layer)).find((k) => k.id === "K_SHIFT")?.multitap;
    expect(tap("rightalt")).toEqual([{ id: "T_CAPS", text: "*ShiftLock*", nextlayer: "rightalt-caps" }]);
    expect(tap("ctrl")).toEqual([{ id: "T_CAPS", text: "*ShiftLock*", nextlayer: "ctrl-caps" }]);
  });

  it("does not build rightalt-caps when there is no rightalt-shift", () => {
    const out = run(JSON.parse(fx("touch/caps_missing_letters.keyman-touch-layout")) as Raw);
    expect(layerOf(out, "rightalt-caps")).toBeUndefined();
    expect(layerOf(out, "ctrl-caps")).toBeUndefined();
  });

  it("character keys on non-default, non-caps layers return to default; special keys do not", () => {
    const raw = withModifierLayers();
    const out = run(raw);
    for (const id of ["shift", "rightalt", "rightalt-shift", "ctrl"]) {
      for (const k of keysOf(layerOf(out, id))) {
        if (k.id === "K_SHIFT") continue; // covered by the labelling test
        const sp = Number((k as { sp?: string | number }).sp ?? 0);
        const before = keysOf(layerOf(raw, id)).find((x) => x.id === k.id)!;
        if ([1, 2, 8, 9, 10].includes(sp) || before.nextlayer !== undefined) {
          expect(k.nextlayer, `${id}/${k.id}`).toBe(before.nextlayer);
        } else {
          expect(k.nextlayer, `${id}/${k.id}`).toBe("default");
        }
      }
    }
    // default and caps character keys are left alone.
    for (const id of ["default", "caps", "rightalt-caps"]) {
      const l = layerOf(out, id);
      for (const k of keysOf(l)) {
        if (!(k.id.startsWith("K_") && /^[A-Z]$/.test(k.id.slice(2)))) continue;
        expect(k.nextlayer, `${id}/${k.id}`).toBeUndefined();
      }
    }
  });

  it("labels Shift on shift and caps layers and returns it to the unshifted layer", () => {
    const out = run(withModifierLayers());
    const shiftKey = (layer: string) => keysOf(layerOf(out, layer)).find((k) => k.id === "K_SHIFT")!;
    expect(shiftKey("shift")).toMatchObject({ text: "*Shifted*", nextlayer: "default" });
    expect(shiftKey("caps")).toMatchObject({ text: "*ShiftedLock*", nextlayer: "default" });
    expect(shiftKey("rightalt-shift")).toMatchObject({ text: "*Shifted*", nextlayer: "rightalt" });
    expect(shiftKey("rightalt-caps")).toMatchObject({ text: "*ShiftedLock*", nextlayer: "rightalt" });
    expect(shiftKey("ctrl-shift")).toMatchObject({ text: "*Shifted*", nextlayer: "ctrl" });
    expect(shiftKey("ctrl-caps")).toMatchObject({ text: "*ShiftedLock*", nextlayer: "ctrl" });
  });

  it("is idempotent on the full layout", () => {
    const once = syncTouchCapsLayerRaw(JSON.stringify(withModifierLayers()), { bcp47: "en" });
    const twice = syncTouchCapsLayerRaw(once.json, { bcp47: "en" });
    expect(twice).toEqual({ json: once.json, changed: false });
  });
});

describe("syncTouchCapsLayerRaw robustness", () => {
  it("returns malformed JSON unchanged instead of throwing", () => {
    const bad = '{"tablet": {"layer": [';
    expect(syncTouchCapsLayerRaw(bad, { bcp47: "en" })).toEqual({ json: bad, changed: false });
  });

  it("creates the caps row when a missing key's row is absent from the caps layer", () => {
    const raw = JSON.parse(fx("touch/caps_missing_letters.keyman-touch-layout")) as Raw;
    const caps = layerOf(raw, "caps")!;
    const def = layerOf(raw, "default")!;
    // Drop caps' last row (and its keys); default keeps its own.
    caps.row = caps.row.slice(0, 1);
    expect(def.row.length).toBeGreaterThan(1);
    const out = JSON.parse(syncTouchCapsLayerRaw(JSON.stringify(raw), { bcp47: "en" }).json) as Raw;
    const outCaps = keysOf(layerOf(out, "caps"));
    for (const k of keysOf(def).filter((k) => /^[a-z]$/.test(k.text ?? ""))) {
      expect(outCaps.find((c) => c.id === k.id)?.text).toBe((k.text ?? "").toUpperCase());
    }
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

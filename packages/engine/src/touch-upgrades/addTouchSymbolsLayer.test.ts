import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { addTouchSymbolsLayerRaw } from "./addTouchSymbolsLayer.js";
import { SYMBOLS_LAYER } from "./symbolsLayerData.js";

const fx = (p: string) =>
  readFileSync(new URL(`../caps/__fixtures__/${p}`, import.meta.url), "utf8");
const UPSTREAM = "upstream_basic_kbdus/basic_kbdus.keyman-touch-layout";
const FORK = new URL(
  "../../../../../keyboards/release/basic/basic_kbdus/source/basic_kbdus.keyman-touch-layout",
  import.meta.url,
);

interface RawKey {
  id: string;
  text?: string;
  sp?: string | number;
  width?: string | number;
  nextlayer?: string;
}
interface RawLayer {
  id: string;
  row: Array<{ key: RawKey[] }>;
}
type Raw = Record<string, { layer: RawLayer[] }>;
const layers = (raw: Raw, platform = "tablet") => raw[platform]!.layer;
const layer = (raw: Raw, id: string, platform = "tablet") => layers(raw, platform).find((l) => l.id === id);
const keys = (l: RawLayer | undefined) => (l?.row ?? []).flatMap((r) => r.key);

describe("addTouchSymbolsLayerRaw", () => {
  it("adds the symbol layer and a K_SYMBOLS key to upstream basic_kbdus' tablet", () => {
    const before = JSON.parse(fx(UPSTREAM)) as Raw;
    const res = addTouchSymbolsLayerRaw(fx(UPSTREAM));
    expect(res.changed).toBe(true);
    const out = JSON.parse(res.json) as Raw;
    // The owner's symbols data, its character keys returning to default after one tap.
    const added = layer(out, "symbol")!;
    expect(keys(added).map((k) => [k.id, k.text])).toEqual(
      SYMBOLS_LAYER.row.flatMap((r) => r.key).map((k) => [k["id"], k["text"]]),
    );
    for (const k of keys(added)) {
      if (![1, 2, 8, 9, 10].includes(Number(k.sp ?? 0))) expect(k.nextlayer, k.id).toBe("default");
    }
    for (const id of ["default", "shift"]) {
      expect(keys(layer(out, id)).filter((k) => k.id === "K_SYMBOLS")).toEqual([
        { id: "K_SYMBOLS", text: "*Symbol*", sp: 1, width: 140, nextlayer: "symbol" },
      ]);
    }
    // The phone uses the numerals scheme and is left exactly as it was.
    expect(out["phone"]).toEqual(before["phone"]);
  });

  it("places the key after K_LOPT and takes the room from K_SPACE like the fork's change", () => {
    const out = JSON.parse(addTouchSymbolsLayerRaw(fx(UPSTREAM)).json) as Raw;
    const row = layer(out, "default")!.row.find((r) => r.key.some((k) => k.id === "K_SPACE"))!.key;
    const ids = row.map((k) => k.id);
    expect(ids.indexOf("K_SYMBOLS")).toBe(ids.indexOf("K_LOPT") + 1);
    expect(ids.indexOf("K_SPACE")).toBe(ids.indexOf("K_SYMBOLS") + 1);
    // Same widths the fork's basic_kbdus carries: K_SYMBOLS 140, K_SPACE 930 -> 865.
    expect(row.find((k) => k.id === "K_SPACE")!.width).toBe("865");
  });

  it("changes nothing else: other members of every layer are kept", () => {
    const before = JSON.parse(fx(UPSTREAM)) as Raw;
    const out = JSON.parse(addTouchSymbolsLayerRaw(fx(UPSTREAM)).json) as Raw;
    for (const l of layers(before)) {
      const after = keys(layer(out, l.id)).filter((k) => k.id !== "K_SYMBOLS");
      const was = keys(l);
      expect(after.length).toBe(was.length);
      for (const [i, k] of was.entries()) {
        const { width: w1, ...rest1 } = k;
        const { width: w2, ...rest2 } = after[i]!;
        expect(rest2).toEqual(rest1);
        if (k.id !== "K_SPACE") expect(w2).toEqual(w1);
      }
    }
  });

  it("is idempotent, and byte-identical when nothing is missing", () => {
    const once = addTouchSymbolsLayerRaw(fx(UPSTREAM));
    const twice = addTouchSymbolsLayerRaw(once.json);
    expect(twice).toEqual({ json: once.json, changed: false });
  });

  it("returns the input unchanged for malformed JSON", () => {
    expect(addTouchSymbolsLayerRaw("{")).toEqual({ json: "{", changed: false });
  });

  it("links caps layers to a symbol-caps layer that returns to caps", () => {
    const raw = JSON.parse(fx(UPSTREAM)) as Raw;
    raw["tablet"]!.layer.push({ ...(JSON.parse(JSON.stringify(layer(raw, "shift"))) as RawLayer), id: "caps" });
    const out = JSON.parse(addTouchSymbolsLayerRaw(JSON.stringify(raw)).json) as Raw;
    expect(keys(layer(out, "caps")).find((k) => k.id === "K_SYMBOLS")?.nextlayer).toBe("symbol-caps");
    const sc = layer(out, "symbol-caps")!;
    expect(keys(sc).find((k) => k.id === "T_UPPER")).toEqual({ id: "T_UPPER", text: "*ABC*", sp: 2, nextlayer: "caps" });
    expect(keys(sc).some((k) => k.id === "K_LOWER")).toBe(false);
    expect(keys(sc).filter((k) => k.nextlayer === "default")).toEqual([]);
  });

  it("leaves a platform alone when the link key does not fit", () => {
    const raw = JSON.parse(fx(UPSTREAM)) as Raw;
    // Spacebar already near the floor with no slack in the row.
    const space = keys(layer(raw, "default")).find((k) => k.id === "K_SPACE")!;
    space.width = 520;
    const text = JSON.stringify(raw);
    expect(addTouchSymbolsLayerRaw(text)).toEqual({ json: text, changed: false });
  });

  it("leaves a platform alone when a layer has no spacebar row", () => {
    const raw = JSON.parse(fx(UPSTREAM)) as Raw;
    for (const row of layer(raw, "shift")!.row) row.key = row.key.filter((k) => k.id !== "K_SPACE");
    const text = JSON.stringify(raw);
    expect(addTouchSymbolsLayerRaw(text)).toEqual({ json: text, changed: false });
  });

  it("adds only the missing link keys when a symbol layer and some links exist", () => {
    const first = JSON.parse(addTouchSymbolsLayerRaw(fx(UPSTREAM)).json) as Raw;
    const shiftRow = layer(first, "shift")!.row.find((r) => r.key.some((k) => k.id === "K_SYMBOLS"))!;
    shiftRow.key = shiftRow.key.filter((k) => k.id !== "K_SYMBOLS");
    const out = JSON.parse(addTouchSymbolsLayerRaw(JSON.stringify(first)).json) as Raw;
    expect(keys(layer(out, "shift")).filter((k) => k.id === "K_SYMBOLS")).toHaveLength(1);
    expect(keys(layer(out, "default")).filter((k) => k.id === "K_SYMBOLS")).toHaveLength(1);
  });

  it.skipIf(!existsSync(FORK))("the fork's basic_kbdus already has what the fixer adds", () => {
    const text = readFileSync(FORK, "utf8");
    expect(addTouchSymbolsLayerRaw(text)).toEqual({ json: text, changed: false });
  });
});

import { describe, it, expect } from "vitest";
import { parse } from "./parse.js";
import { emit } from "./emit.js";
import { OPAQUE_REASONS } from "./opaque-reasons.js";

// store(grv.all) outs(base) outs(grv) -- sil_yoruba8 shape. The store stays
// opaque (outs-expansion) but carries a lenient storeSketch of flattened items.
const KMN = `store(&VERSION) '10.0'
store(&NAME) 'Store Sketch Test'
store(base) 'aeo'
store(grv) U+0300 U+0301
store(grv.all) outs(base) outs(grv)

begin Unicode > use(main)

group(main) using keys

+ [K_A] > 'a'
`;

describe("parse -- storeSketch on opaque stores", () => {
  it("keeps the outs() store opaque and flattens its items into storeSketch", () => {
    const { ir } = parse(KMN, "store-sketch-test");
    const frag = ir.raw.find(
      (r) => r.reason === OPAQUE_REASONS.OUTS_EXPANSION && r.sourceText.includes("grv.all"),
    );
    expect(frag).toBeDefined();
    expect(frag?.storeSketch).toBeDefined();
    const chars = (frag?.storeSketch ?? []).flatMap((i) => (i.kind === "char" ? [i.value] : []));
    expect(chars).toEqual(["a", "e", "o", "\u0300", "\u0301"]);
  });

  it("emit leaves the source text byte-identical", () => {
    const { ir } = parse(KMN, "store-sketch-test");
    const out = emit(ir);
    expect(out).toContain("store(grv.all) outs(base) outs(grv)");
    expect(emit(parse(out, "store-sketch-test").ir)).toBe(out);
  });

  it("drops the sketch instead of growing without bound when outs() chains multiply", () => {
    const big = `store(&VERSION) '10.0'
store(&NAME) 'Sketch Cap'
store(a) U+4E00..U+9FFF
store(small) outs(a)
store(huge) ${"outs(small) ".repeat(8)}
store(ok) outs(a) U+0041

begin Unicode > use(main)

group(main) using keys

+ [K_A] > 'a'
`;
    const { ir } = parse(big, "sketch-cap");
    const sketchOf = (name: string) => ir.raw.find((r) => r.sourceText.includes(`store(${name})`))?.storeSketch;
    expect(sketchOf("huge")).toBeUndefined();
    expect(sketchOf("ok")).toBeDefined();
  });
});

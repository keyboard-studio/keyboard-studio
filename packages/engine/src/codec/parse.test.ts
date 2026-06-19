import { describe, it, expect } from "vitest";
import { parse } from "./parse.js";

const MINIMAL_KMN = `c keyboard header
store(&VERSION) '10.0'
store(&NAME) 'Test Keyboard'
store(&TARGETS) 'any'
store(&COPYRIGHT) '(c) 2024 SIL'
store(&KEYBOARDVERSION) '1.0'

begin Unicode > use(main)

group(main) using keys

c This comment precedes the space rule
+ [K_SPACE] > U+0020
+ [K_A] > U+0061
+ [SHIFT K_A] > U+0041
`;

describe("parse", () => {
  it("produces a KeyboardIR with correct origin", () => {
    const { ir } = parse(MINIMAL_KMN, "test");
    expect(ir.origin).toBe("imported");
  });

  it("extracts header fields", () => {
    const { ir } = parse(MINIMAL_KMN, "test");
    expect(ir.header.keyboardId).toBe("test");
    expect(ir.header.name).toBe("Test Keyboard");
    expect(ir.header.version).toBe("1.0");
    expect(ir.header.copyright).toBe("(c) 2024 SIL");
    expect(ir.header.targets).toEqual(["any"]);
  });

  it("creates one group named 'main' with usingKeys", () => {
    const { ir } = parse(MINIMAL_KMN, "test");
    expect(ir.groups.length).toBe(1);
    expect(ir.groups[0]?.name).toBe("main");
    expect(ir.groups[0]?.usingKeys).toBe(true);
  });

  it("creates 3 rules", () => {
    const { ir } = parse(MINIMAL_KMN, "test");
    expect(ir.groups[0]?.rules.length).toBe(3);
  });

  it("first rule has vkey context [K_SPACE] and char output U+0020", () => {
    const { ir } = parse(MINIMAL_KMN, "test");
    const rule = ir.groups[0]?.rules[0];
    expect(rule?.context[0]).toMatchObject({ kind: "vkey", name: "K_SPACE", modifiers: [] });
    expect(rule?.output[0]).toMatchObject({ kind: "char", value: " " });
  });

  it("third rule has [SHIFT K_A] context with SHIFT modifier", () => {
    const { ir } = parse(MINIMAL_KMN, "test");
    const rule = ir.groups[0]?.rules[2];
    expect(rule?.context[0]).toMatchObject({
      kind: "vkey",
      name: "K_A",
      modifiers: ["SHIFT"],
    });
  });

  it("attaches leading comment to first rule", () => {
    const { ir } = parse(MINIMAL_KMN, "test");
    const spaceRule = ir.groups[0]?.rules[0];
    const leading = ir.comments.filter(
      c => c.anchor === "leading" && c.anchorRef?.nodeId === spaceRule?.nodeId
    );
    expect(leading.length).toBeGreaterThan(0);
    expect(leading[0]?.text).toContain("This comment precedes");
  });

  it("populates stores array with system stores", () => {
    const { ir } = parse(MINIMAL_KMN, "test");
    const sys = ir.stores.filter(s => s.isSystem);
    const names = sys.map(s => s.name);
    expect(names).toContain("VERSION");
    expect(names).toContain("NAME");
  });

  it("raw fragments array is empty for clean kmn", () => {
    const { ir } = parse(MINIMAL_KMN, "test");
    expect(ir.raw.length).toBe(0);
  });

  it("recognizedPatterns starts empty", () => {
    const { ir } = parse(MINIMAL_KMN, "test");
    expect(ir.recognizedPatterns).toEqual([]);
  });

  it("throws on completely malformed begin", () => {
    const bad = "begin GARBAGE\n";
    expect(() => parse(bad, "bad")).toThrow();
  });

  describe("named deadkey in a store body (#266)", () => {
    const KMN = `store(&VERSION) '10.0'
store(&NAME) 'NDK Test'
store(&TARGETS) 'any'
store(errmark) dk(a_err)
store(numdk) dk(007e)
begin Unicode > use(main)
group(main) using keys
+ [K_A] > U+0061
`;

    it("classifies a store body with a named deadkey as opaque NAMED_DEADKEY (not silently raw, not SMP_LITERAL)", () => {
      const { ir, opaqueFeatures } = parse(KMN, "ndk");
      // The errmark store is wrapped as a raw fragment with the correct reason…
      const frag = ir.raw.find((f) => f.sourceText.includes("errmark"));
      expect(frag).toBeDefined();
      expect(frag?.reason).toBe("named-deadkey");
      // …counted under the right feature, not mislabelled as smp-literal.
      expect(opaqueFeatures).toContainEqual({ feature: "named-deadkey", count: 1 });
      expect(opaqueFeatures.some((f) => f.feature === "smp-literal")).toBe(false);
      // …and NOT emitted as a normal parsed store.
      expect(ir.stores.some((s) => s.name === "errmark")).toBe(false);
    });

    it("still parses a numeric dk(NNNN) store as a normal deadkey store (regression guard)", () => {
      const { ir } = parse(KMN, "ndk");
      const numStore = ir.stores.find((s) => s.name === "numdk");
      expect(numStore).toBeDefined();
      expect(numStore?.items).toContainEqual({ kind: "deadkey", id: 0x7e });
      expect(ir.raw.some((f) => f.sourceText.includes("numdk"))).toBe(false);
    });

    it("treats the WHOLE store as opaque when a named deadkey follows valid items (early-return discards partials)", () => {
      // A named deadkey mid-list means the store can't be represented in the
      // typed IR; the parser early-returns an opaque reason and the caller wraps
      // the entire store as a RawKmnFragment. The already-parsed valid items
      // (U+0061, U+0062) are intentionally discarded — NOT salvaged into a
      // partial store. This guards future callers from expecting partial results.
      const MIXED = `store(&VERSION) '10.0'
store(&NAME) 'Mixed'
store(&TARGETS) 'any'
store(mixed) U+0061 dk(a_err) U+0062
begin Unicode > use(main)
group(main) using keys
+ [K_A] > U+0061
`;
      const { ir, opaqueFeatures } = parse(MIXED, "mixed");
      // The whole store is opaque — not emitted as a parsed store…
      expect(ir.stores.some((s) => s.name === "mixed")).toBe(false);
      // …wrapped as a single raw fragment whose sourceText is the ENTIRE store
      // body: the valid U+0061 / U+0062 are captured opaque, not salvaged into a
      // partial store.
      const frag = ir.raw.find((f) => f.sourceText.includes("store(mixed)"));
      expect(frag?.reason).toBe("named-deadkey");
      expect(frag?.sourceText).toContain("U+0061");
      expect(frag?.sourceText).toContain("U+0062");
      expect(opaqueFeatures).toContainEqual({ feature: "named-deadkey", count: 1 });
    });
  });
});

// ---------------------------------------------------------------------------
// Numeric store names (malar_braille fix — #412)
//
// kmcmplib's Validation::ValidateIdentifier does NOT reject leading digits, so
// `store(1) '1'` and `store(12) 'a'` are legal.  KMN_IDENT = /[^\s\(\)\,]+/
// must match them without throwing.  Prior to the fix, a stricter identifier
// regex rejected digit-only names and either threw or produced a RawKmnFragment
// where a typed IRStore was expected.
// ---------------------------------------------------------------------------

const NUMERIC_STORE_KMN = `c malar_braille-style numeric store
store(&VERSION) '10.0'
store(&NAME) 'Numeric Test'
store(&TARGETS) 'any'
store(1) '1'
store(12) 'abcdef'

begin Unicode > use(main)

group(main) using keys

+ [K_A] > any(1)
`;

describe("parse — numeric store names (#412)", () => {
  it("parses a digit-only store name without throwing", () => {
    expect(() => parse(NUMERIC_STORE_KMN, "numeric-test")).not.toThrow();
  });

  it("produces a typed IRStore for store(1) with name '1'", () => {
    const { ir } = parse(NUMERIC_STORE_KMN, "numeric-test");
    const store1 = ir.stores.find(s => s.name === "1");
    expect(store1).toBeDefined();
    expect(store1?.isSystem).toBe(false);
    // store(1) '1' → one char item with value '1'
    expect(store1?.items).toHaveLength(1);
    expect(store1?.items[0]).toMatchObject({ kind: "char", value: "1" });
  });

  it("produces a typed IRStore for store(12) with name '12'", () => {
    const { ir } = parse(NUMERIC_STORE_KMN, "numeric-test");
    const store12 = ir.stores.find(s => s.name === "12");
    expect(store12).toBeDefined();
    expect(store12?.isSystem).toBe(false);
    expect(store12?.items).toHaveLength(6);
  });

  it("numeric-named store does NOT land in ir.raw (must be typed, not opaque)", () => {
    const { ir } = parse(NUMERIC_STORE_KMN, "numeric-test");
    // If the store were mis-parsed as a RawKmnFragment it would show up here.
    const rawStore = ir.raw.find(r => r.sourceText.includes("store(1)") || r.sourceText.includes("store(12)"));
    expect(rawStore).toBeUndefined();
  });

  it("a digit-prefixed alphanumeric store name (e.g. store(1base)) also parses", () => {
    // Digits-plus-letters: less common but also valid under kmcmplib rules.
    const kmnWithMixed = `store(&VERSION) '10.0'\nstore(&NAME) 'T'\nstore(&TARGETS) 'any'\nstore(1base) 'xyz'\nbegin Unicode > use(main)\ngroup(main) using keys\n+ [K_A] > any(1base)\n`;
    const { ir } = parse(kmnWithMixed, "mixed-id-test");
    const storeMixed = ir.stores.find(s => s.name === "1base");
    expect(storeMixed).toBeDefined();
    expect(storeMixed?.isSystem).toBe(false);
  });
});

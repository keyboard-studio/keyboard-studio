import { describe, it, expect } from "vitest";
import { parse } from "./parse.js";
import { emit } from "./emit.js";

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
// Store-body range notation (`X .. Y`, spec 042)
// ---------------------------------------------------------------------------

/** Build a minimal keyboard whose only user store is `storeLine`. */
function kmnWithStore(storeLine: string): string {
  return `store(&VERSION) '10.0'
store(&NAME) 'Range Test'
store(&TARGETS) 'any'
${storeLine}
begin Unicode > use(main)
group(main) using keys
+ [K_A] > U+0061
`;
}

/** Values of a store's char items, in order (non-char items throw). */
function charValues(items: Array<{ kind: string; value?: string }>): string[] {
  return items.map((it) => {
    if (it.kind !== "char" || it.value === undefined) {
      throw new Error(`expected char item, got ${it.kind}`);
    }
    return it.value;
  });
}

describe("store-body range notation (spec 042)", () => {
  describe("US1 — BMP range expansion", () => {
    it("C1: U+0904 .. U+0914 expands to 17 inclusive char items in order, no raw '..' item", () => {
      const { ir } = parse(kmnWithStore("store(svara) U+0904 .. U+0914"), "svara");
      const store = ir.stores.find((s) => s.name === "svara");
      expect(store).toBeDefined();
      expect(store?.items).toHaveLength(17);
      expect(store?.items.every((i) => i.kind === "char")).toBe(true);
      expect(store?.items.some((i) => i.kind === "raw")).toBe(false);
      const vals = charValues(store!.items);
      expect(vals[0]).toBe(String.fromCodePoint(0x0904));
      expect(vals[16]).toBe(String.fromCodePoint(0x0914));
      // strictly ascending +1 across the whole run
      for (let k = 0; k < 17; k++) {
        expect(vals[k]).toBe(String.fromCodePoint(0x0904 + k));
      }
    });

    it("C4: interleaved ranges and singletons resolve in source order", () => {
      const { ir } = parse(
        kmnWithStore("store(p) U+0591 .. U+05AF U+05BD .. U+05BF U+05C0 U+05C4"),
        "p",
      );
      const store = ir.stores.find((s) => s.name === "p");
      // 31 (U+0591..U+05AF) + 3 (U+05BD..U+05BF) + 2 singletons = 36
      expect(store?.items).toHaveLength(36);
      const vals = charValues(store!.items);
      expect(vals[0]).toBe(String.fromCodePoint(0x0591));
      expect(vals[30]).toBe(String.fromCodePoint(0x05af));
      expect(vals[31]).toBe(String.fromCodePoint(0x05bd));
      expect(vals[33]).toBe(String.fromCodePoint(0x05bf));
      expect(vals[34]).toBe(String.fromCodePoint(0x05c0));
      expect(vals[35]).toBe(String.fromCodePoint(0x05c4));
    });

    it("C2: single-char quoted endpoints, and mixed U+/quoted, are accepted", () => {
      const quoted = parse(kmnWithStore("store(a) 'अ' .. 'ऐ'"), "a").ir.stores.find((s) => s.name === "a");
      // 'अ' = U+0905, 'ऐ' = U+0910 → 12 inclusive codepoints
      expect(quoted?.items).toHaveLength(12);
      expect(charValues(quoted!.items)[0]).toBe(String.fromCodePoint(0x0905));
      expect(charValues(quoted!.items)[11]).toBe(String.fromCodePoint(0x0910));

      const mixed = parse(kmnWithStore("store(b) U+0905 .. 'ऐ'"), "b").ir.stores.find((s) => s.name === "b");
      expect(mixed?.items).toHaveLength(12);
      expect(charValues(mixed!.items)[0]).toBe(String.fromCodePoint(0x0905));
      expect(charValues(mixed!.items)[11]).toBe(String.fromCodePoint(0x0910));
    });

    it("C3: whitespace variants (incl. no-space and hybrids) denote the same range", () => {
      const forms = [
        "U+0905 .. U+0910",
        "U+0905..U+0910",
        "U+0905 ..U+0910",
        "U+0905.. U+0910",
        "U+0905  ..  U+0910",
      ];
      for (const form of forms) {
        const store = parse(kmnWithStore(`store(w) ${form}`), "w").ir.stores.find((s) => s.name === "w");
        expect(store, form).toBeDefined();
        expect(store?.items, form).toHaveLength(12);
        expect(charValues(store!.items)[0], form).toBe(String.fromCodePoint(0x0905));
        expect(charValues(store!.items)[11], form).toBe(String.fromCodePoint(0x0910));
      }
    });
  });

  describe("US2 — SMP / astral range expansion", () => {
    it("C5: U+11680 .. U+11689 expands to 10 astral char items, store NOT opaque(smp-literal)", () => {
      const { ir, opaqueFeatures } = parse(kmnWithStore("store(ConsU) U+11680 .. U+11689"), "smp");
      const store = ir.stores.find((s) => s.name === "ConsU");
      expect(store).toBeDefined();
      expect(store?.items).toHaveLength(10);
      const vals = charValues(store!.items);
      expect(vals[0]).toBe(String.fromCodePoint(0x11680));
      expect(vals[9]).toBe(String.fromCodePoint(0x11689));
      // the store is expanded, not discarded to an smp-literal fragment
      expect(ir.raw.some((f) => f.sourceText.includes("ConsU"))).toBe(false);
      expect(opaqueFeatures.some((f) => f.feature === "smp-literal")).toBe(false);
    });

    it("C6: range straddling BMP↔SMP expands across the boundary", () => {
      const { ir } = parse(kmnWithStore("store(x) U+FFFE .. U+10001"), "straddle");
      const store = ir.stores.find((s) => s.name === "x");
      expect(store?.items).toHaveLength(4);
      expect(charValues(store!.items)).toEqual([
        String.fromCodePoint(0xfffe),
        String.fromCodePoint(0xffff),
        String.fromCodePoint(0x10000),
        String.fromCodePoint(0x10001),
      ]);
    });

    it("C10: a standalone astral singleton keeps its existing smp-literal opaque handling", () => {
      const { ir, opaqueFeatures } = parse(kmnWithStore("store(x) U+11680"), "single");
      expect(ir.stores.some((s) => s.name === "x")).toBe(false);
      const frag = ir.raw.find((f) => f.sourceText.includes("store(x)"));
      expect(frag?.reason).toBe("smp-literal");
      expect(opaqueFeatures).toContainEqual({ feature: "smp-literal", count: 1 });
    });
  });

  describe("US3 — degenerate / malformed ranges fail safe", () => {
    it("C7: single-codepoint range U+0905 .. U+0905 → exactly one char item (lenient)", () => {
      const { ir } = parse(kmnWithStore("store(x) U+0905 .. U+0905"), "eq");
      const store = ir.stores.find((s) => s.name === "x");
      expect(store?.items).toHaveLength(1);
      expect(charValues(store!.items)[0]).toBe(String.fromCodePoint(0x0905));
    });

    it("C8: descending range U+0910 .. U+0905 → opaque(descending-range), zero typed items", () => {
      const { ir, opaqueFeatures } = parse(kmnWithStore("store(x) U+0910 .. U+0905"), "desc");
      expect(ir.stores.some((s) => s.name === "x")).toBe(false);
      const frag = ir.raw.find((f) => f.sourceText.includes("store(x)"));
      expect(frag?.reason).toBe("descending-range");
      expect(opaqueFeatures).toContainEqual({ feature: "descending-range", count: 1 });
    });

    it("C9: malformed ranges → opaque(malformed-range)", () => {
      for (const body of ["U+0905 ..", "U+0905 .. foo", "'ab' .. U+0910"]) {
        const { ir } = parse(kmnWithStore(`store(x) ${body}`), "mal");
        expect(ir.stores.some((s) => s.name === "x"), body).toBe(false);
        const frag = ir.raw.find((f) => f.sourceText.includes("store(x)"));
        expect(frag?.reason, body).toBe("malformed-range");
      }
    });

    it("a vkey-bracket range `[K_A]..[K_Z]` is NOT a codepoint range — store stays typed (no opaque)", () => {
      // &CasedKeys uses a virtual-key range, not a codepoint range. Neither
      // endpoint decodes as a codepoint, so the `..` must fall through to legacy
      // per-token handling (vkey, raw `..`, vkey), NOT opaque the store.
      // Regression guard for sil_cameroon_qwerty's `store(&CasedKeys) [K_A]..[K_Z]`.
      const { ir } = parse(kmnWithStore("store(&CasedKeys) [K_A]..[K_Z]"), "vk");
      expect(ir.raw.some((f) => f.sourceText.includes("CasedKeys"))).toBe(false);
      const store = ir.stores.find((s) => s.name === "CasedKeys");
      expect(store).toBeDefined();
      expect(store?.items.map((it) => it.kind)).toEqual(["vkey", "raw", "vkey"]);
    });

    it("a mixed vkey/codepoint range `[K_A] .. U+0060` fails safe as opaque(malformed-range)", () => {
      // One endpoint decodes (U+0060), one does not ([K_A]) → intended-but-broken
      // codepoint range. Invalid Keyman, not in the corpus; the safe choice is to
      // surface the whole store opaque with a diagnostic, not split it silently.
      const { ir } = parse(kmnWithStore("store(x) [K_A] .. U+0060"), "mix");
      expect(ir.stores.some((s) => s.name === "x")).toBe(false);
      const frag = ir.raw.find((f) => f.sourceText.includes("store(x)"));
      expect(frag?.reason).toBe("malformed-range");
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

describe("use(group) in rule output (#268)", () => {
  const KMN = `store(&VERSION) '10.0'
store(&NAME) 'UseGroup Test'
store(&TARGETS) 'any'
store(&KEYBOARDVERSION) '1.0'

begin Unicode > use(main)

group(main) using keys
+ [K_A] > use(deadkeys)

group(deadkeys)
+ [K_B] > U+0062
`;

  it("parses use(group) in output as a typed useGroup node (not raw, not opaque)", () => {
    const { ir, opaqueFeatures } = parse(KMN, "ug");
    const main = ir.groups.find((g) => g.name === "main");
    const rule = main?.rules.find((r) =>
      r.output.some((o) => o.kind === "useGroup"),
    );
    expect(rule).toBeDefined();
    expect(rule!.output).toContainEqual({ kind: "useGroup", groupName: "deadkeys" });
    // Not wrapped as raw, and the rule did NOT make the keyboard opaque.
    expect(rule!.output.some((o) => o.kind === "raw")).toBe(false);
    expect(ir.raw.length).toBe(0);
    expect(opaqueFeatures.length).toBe(0);
  });

  it("emits useGroup back to use(groupName) and round-trips structurally", () => {
    const { ir } = parse(KMN, "ug");
    const emitted = emit(ir);
    expect(emitted).toContain("use(deadkeys)");
    // Re-parse the emitted text; the useGroup node survives identically.
    const { ir: ir2 } = parse(emitted, "ug");
    const out2 = ir2.groups
      .find((g) => g.name === "main")
      ?.rules.flatMap((r) => r.output);
    expect(out2).toContainEqual({ kind: "useGroup", groupName: "deadkeys" });
  });
});

// ---------------------------------------------------------------------------
// Trailing `c <comment>` on store lines (kmcmplib treats it as a line comment,
// not store content). Quote/bracket-aware stripping is shared with rule lines.
// ---------------------------------------------------------------------------

describe("trailing comment on store lines", () => {
  const withStoreComment = `store(&VERSION) '10.0'
store(&NAME) 'My Keyboard' c the display name
store(&TARGETS) 'any'
store(vowels) 'aeiou' c Latin vowels
begin Unicode > use(main)
group(main) using keys
+ [K_A] > any(vowels)
`;

  it("does not leak a trailing comment into a system-store header value", () => {
    const { ir } = parse(withStoreComment, "sc");
    expect(ir.header.name).toBe("My Keyboard");
  });

  it("does not leak a trailing comment into user-store items", () => {
    const { ir } = parse(withStoreComment, "sc");
    const vowels = ir.stores.find((s) => s.name === "vowels");
    expect(vowels?.items.map((i) => (i as { value?: string }).value)).toEqual([
      "a", "e", "i", "o", "u",
    ]);
  });

  it("preserves the store trailing comment on emit (round-trips)", () => {
    const { ir } = parse(withStoreComment, "sc");
    const emitted = emit(ir);
    expect(emitted).toContain("store(vowels) 'aeiou' c Latin vowels");
    // Re-parsing keeps items clean and comment intact.
    const { ir: ir2 } = parse(emitted, "sc");
    const vowels2 = ir2.stores.find((s) => s.name === "vowels");
    expect(vowels2?.items.length).toBe(5);
    expect(vowels2?.trailingComment).toBe("Latin vowels");
  });

  it("does not mistake a `c` inside a quoted store value for a comment", () => {
    const { ir } = parse(
      `store(&VERSION) '10.0'\nstore(&NAME) 'T'\nstore(&TARGETS) 'any'\nstore(x) 'a c b'\nbegin Unicode > use(main)\ngroup(main) using keys\n+ [K_A] > any(x)\n`,
      "q",
    );
    const x = ir.stores.find((s) => s.name === "x");
    expect(x?.items.map((i) => (i as { value?: string }).value)).toEqual([
      "a", " ", "c", " ", "b",
    ]);
    expect(x?.trailingComment).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Quote-aware trailing-comment stripping on rule output (a standalone `c`
// inside a quoted output string must not be treated as a comment).
// ---------------------------------------------------------------------------

describe("trailing comment on rule lines is quote-aware", () => {
  it("keeps a `c` inside a quoted output literal as output, not a comment", () => {
    const { ir } = parse(
      `store(&VERSION) '10.0'\nstore(&NAME) 'T'\nstore(&TARGETS) 'any'\nbegin Unicode > use(main)\ngroup(main) using keys\n+ [K_1] > 'a c b'\n`,
      "rc",
    );
    const rule = ir.groups[0]?.rules[0];
    expect(rule?.output.map((o) => (o as { value?: string }).value)).toEqual([
      "a", " ", "c", " ", "b",
    ]);
    expect(rule?.trailingComment).toBeUndefined();
  });

  it("still strips a genuine trailing comment after a quoted output literal", () => {
    const { ir } = parse(
      `store(&VERSION) '10.0'\nstore(&NAME) 'T'\nstore(&TARGETS) 'any'\nbegin Unicode > use(main)\ngroup(main) using keys\n+ [K_1] > 'ab' c a real comment\n`,
      "rc",
    );
    const rule = ir.groups[0]?.rules[0];
    expect(rule?.output.map((o) => (o as { value?: string }).value)).toEqual(["a", "b"]);
    expect(rule?.trailingComment).toBe("a real comment");
  });
});

// ---------------------------------------------------------------------------
// CasedKeys is emitted in its canonical SYSTEM_STORE_ORDER slot (case-insensitive
// lookup) rather than falling through to the alphabetical remainder sweep.
// ---------------------------------------------------------------------------

describe("CasedKeys system store emission order", () => {
  it("emits &CASEDKEYS in its canonical position, before other user output", () => {
    const { ir } = parse(
      `store(&VERSION) '10.0'\nstore(&NAME) 'T'\nstore(&TARGETS) 'any'\nstore(&CASEDKEYS) [K_A] [K_B]\nbegin Unicode > use(main)\ngroup(main) using keys\n+ [K_A] > U+0061\n`,
      "ck",
    );
    const emitted = emit(ir);
    // CasedKeys appears exactly once, and before the begin directive (i.e. in the
    // canonical system-store block, not the trailing alphabetical sweep gap).
    const casedIdx = emitted.indexOf("store(&CasedKeys)");
    const beginIdx = emitted.indexOf("begin Unicode");
    expect(casedIdx).toBeGreaterThanOrEqual(0);
    expect(casedIdx).toBeLessThan(beginIdx);
    expect(emitted.match(/store\(&CasedKeys\)/g)?.length).toBe(1);
  });
});

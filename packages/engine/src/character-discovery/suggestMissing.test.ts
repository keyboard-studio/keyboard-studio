/**
 * Unit tests for suggestMissingCharacters (suggestMissing.ts).
 *
 * All CLDR data is injected via fake CldrFullLoaders — no network calls.
 * KeyboardIR fixtures are built using makeTestIR / charItems from the
 * contracts package so the producedSet derivation matches real usage.
 */

import { describe, it, expect } from "vitest";
import { suggestMissingCharacters } from "./suggestMissing.js";
import type { CldrFullLoader } from "./cldr.js";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { IRGroup, IRRule } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/** Build a loader that returns the supplied main+auxiliary pair for every locale. */
function makeLoader(
  main: string,
  auxiliary: string | null = null,
): CldrFullLoader {
  return async (_locale: string) => ({ main, auxiliary });
}

/** Loader that returns null (locale not found). */
const nullLoader: CldrFullLoader = async (_locale) => null;

function makeGroup(rules: IRRule[], name = "main"): IRGroup {
  return { nodeId: `group#${name}`, name, usingKeys: true, readonly: false, rules };
}

function makeRule(output: IRRule["output"]): IRRule {
  return {
    nodeId: `rule#${Math.random().toString(36).slice(2)}`,
    context: [{ kind: "vkey", name: "K_A", modifiers: [] }],
    output,
  };
}

/**
 * Build an IR that produces exactly the given string as individual char elements
 * (one rule per character, NFC-normalized before insertion).
 */
function irProducing(chars: string[]): ReturnType<typeof makeTestIR> {
  const rules = chars.map((c) =>
    makeRule([{ kind: "char", value: c.normalize("NFC") }]),
  );
  return makeTestIR([makeGroup(rules)]);
}

/** Empty IR — produces nothing. */
const emptyIr = makeTestIR([]);

// ---------------------------------------------------------------------------
// 1. Confidence gate — must return null
// ---------------------------------------------------------------------------

describe("suggestMissingCharacters — confidence gate (null)", () => {
  // A loader that would return data if called — used to confirm the gate
  // fires before the loader is consulted.
  const wouldFail: CldrFullLoader = async () => {
    throw new Error("loader should not have been called when gate blocks");
  };

  it("returns null for 'und'", async () => {
    const result = await suggestMissingCharacters({
      bcp47: "und",
      baseIr: emptyIr,
      loader: wouldFail,
    });
    expect(result).toBeNull();
  });

  it("returns null for 'und-Latn' (und with script)", async () => {
    const result = await suggestMissingCharacters({
      bcp47: "und-Latn",
      baseIr: emptyIr,
      loader: wouldFail,
    });
    expect(result).toBeNull();
  });

  it("returns null for script-only tag 'Latn' (no language subtag)", async () => {
    const result = await suggestMissingCharacters({
      bcp47: "Latn",
      baseIr: emptyIr,
      loader: wouldFail,
    });
    expect(result).toBeNull();
  });

  it("returns null for private-use tag 'qaa'", async () => {
    const result = await suggestMissingCharacters({
      bcp47: "qaa",
      baseIr: emptyIr,
      loader: wouldFail,
    });
    expect(result).toBeNull();
  });

  it("returns null for private-use tag 'qtz' (boundary)", async () => {
    const result = await suggestMissingCharacters({
      bcp47: "qtz",
      baseIr: emptyIr,
      loader: wouldFail,
    });
    expect(result).toBeNull();
  });

  it("returns null for bare macrolanguage 'ms' (no region/script)", async () => {
    const result = await suggestMissingCharacters({
      bcp47: "ms",
      baseIr: emptyIr,
      loader: wouldFail,
    });
    expect(result).toBeNull();
  });

  it("returns null for bare macrolanguage 'zh' (no region/script)", async () => {
    const result = await suggestMissingCharacters({
      bcp47: "zh",
      baseIr: emptyIr,
      loader: wouldFail,
    });
    expect(result).toBeNull();
  });

  it("returns null for bare macrolanguage 'ar' (no region/script)", async () => {
    const result = await suggestMissingCharacters({
      bcp47: "ar",
      baseIr: emptyIr,
      loader: wouldFail,
    });
    expect(result).toBeNull();
  });

  // NOTE: "sw" is deliberately NOT gated — Swahili members share Latin
  // orthography/inventory, so CLDR "sw" exemplars are representative.
  // See the "gate passes for sw" test in section 2 below.

  it("returns null for bare macrolanguage 'fa' (no region/script)", async () => {
    const result = await suggestMissingCharacters({
      bcp47: "fa",
      baseIr: emptyIr,
      loader: wouldFail,
    });
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. Gate PASSES for macrolanguage WITH region/script narrower
// ---------------------------------------------------------------------------

describe("suggestMissingCharacters — gate passes for narrowed macrolanguage", () => {
  it("ms-MY passes the gate and returns non-null when loader has data", async () => {
    // Malay with Malaysia region — gate must pass; loader has non-ASCII letters.
    const loader = makeLoader("[a-z é ň]"); // é and ň are non-ASCII letters
    const result = await suggestMissingCharacters({
      bcp47: "ms-MY",
      baseIr: emptyIr,
      loader,
    });
    expect(result).not.toBeNull();
  });

  it("zh-Hant passes the gate and returns non-null when loader has data", async () => {
    // Chinese Traditional with script narrower
    const loader = makeLoader("[中 文]"); // CJK chars as non-ASCII letters
    const result = await suggestMissingCharacters({
      bcp47: "zh-Hant",
      baseIr: emptyIr,
      loader,
    });
    expect(result).not.toBeNull();
  });

  it("ar-MA passes the gate and returns non-null when loader has data", async () => {
    // Arabic with Morocco region
    const loader = makeLoader("[ا ب ت]"); // Arabic letters alef, baa, taa
    const result = await suggestMissingCharacters({
      bcp47: "ar-MA",
      baseIr: emptyIr,
      loader,
    });
    expect(result).not.toBeNull();
  });

  it("bare 'sw' passes the gate and returns non-null (members share Latin orthography)", async () => {
    // "sw" is not in MACROLANGUAGE_SUBTAGS — CLDR sw exemplars are representative.
    const loader = makeLoader("[ẹ ọ]"); // non-ASCII letters sw loader might have
    const result = await suggestMissingCharacters({
      bcp47: "sw",
      baseIr: emptyIr,
      loader,
    });
    expect(result).not.toBeNull();
    expect(result!.main.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Loader returns null — must return null
// ---------------------------------------------------------------------------

describe("suggestMissingCharacters — loader returns no match", () => {
  it("returns null when loader yields null (locale not found)", async () => {
    const result = await suggestMissingCharacters({
      bcp47: "yo", // valid tag, but loader returns nothing
      baseIr: emptyIr,
      loader: nullLoader,
    });
    expect(result).toBeNull();
  });

  it("returns null when loader returns a set with no non-ASCII letters (empty main after filter)", async () => {
    // Only ASCII letters — letterFilter drops them all, gate 5 fires
    const loader = makeLoader("[a b c d e f]");
    const result = await suggestMissingCharacters({
      bcp47: "yo",
      baseIr: emptyIr,
      loader,
    });
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. Normal diff: base produces subset, CLDR main has superset
// ---------------------------------------------------------------------------

describe("suggestMissingCharacters — normal character diff", () => {
  it("returns non-ASCII chars CLDR has that base does not produce", async () => {
    // Base produces a, b, c (all ASCII — excluded by letterFilter anyway)
    // CLDR main: a b c + ẹ (U+1EB9) + ọ (U+1ECD) — only the two non-ASCII survive
    const loader = makeLoader("[a b c ẹ ọ]");
    const baseIr = irProducing(["a", "b", "c"]);
    const result = await suggestMissingCharacters({ bcp47: "yo", baseIr, loader });
    expect(result).not.toBeNull();
    expect(result!.main).toContain("ẹ"); // ẹ
    expect(result!.main).toContain("ọ"); // ọ
  });

  it("main array is sorted ascending by codepoint", async () => {
    // ọ (U+1ECD=7885) before ẹ (U+1EB9=7865) in input — result must be ascending
    const loader = makeLoader("[ọ ẹ]");
    const result = await suggestMissingCharacters({ bcp47: "yo", baseIr: emptyIr, loader });
    expect(result).not.toBeNull();
    const cps = result!.main.map((c) => c.codePointAt(0)!);
    for (let i = 1; i < cps.length; i++) {
      expect(cps[i]!).toBeGreaterThanOrEqual(cps[i - 1]!);
    }
  });

  it("chars already produced by the base are NOT in the suggestion list", async () => {
    // Base produces ẹ and ọ; CLDR also has ẹ and ọ — result should be empty
    const loader = makeLoader("[ẹ ọ]");
    const baseIr = irProducing(["ẹ", "ọ"]);
    const result = await suggestMissingCharacters({ bcp47: "yo", baseIr, loader });
    expect(result).not.toBeNull();
    expect(result!.main).toEqual([]);
  });

  it("languageName is echoed into the result when provided", async () => {
    const loader = makeLoader("[é]");
    const result = await suggestMissingCharacters({
      bcp47: "fr",
      baseIr: emptyIr,
      loader,
      languageName: "French",
    });
    expect(result).not.toBeNull();
    expect(result!.languageName).toBe("French");
  });

  it("languageName is absent when not provided", async () => {
    const loader = makeLoader("[é]");
    const result = await suggestMissingCharacters({ bcp47: "fr", baseIr: emptyIr, loader });
    expect(result).not.toBeNull();
    expect("languageName" in result!).toBe(false);
  });

  it("bcp47 field in result matches the input tag", async () => {
    const loader = makeLoader("[é]");
    const result = await suggestMissingCharacters({ bcp47: "fr-CM", baseIr: emptyIr, loader });
    expect(result).not.toBeNull();
    expect(result!.bcp47).toBe("fr-CM");
  });
});

// ---------------------------------------------------------------------------
// 5. NFC false-positive guard
// ---------------------------------------------------------------------------

describe("suggestMissingCharacters — NFC false-positive guard", () => {
  // é = U+00E9 (precomposed NFC)
  const E_ACUTE_NFC = "é"; // é precomposed
  const E_ACUTE_NFD_E = "e"; // e
  const E_ACUTE_NFD_COMBINING = "́"; // combining acute

  it("CLDR has precomposed e-acute; base produces it precomposed — NOT suggested", async () => {
    const loader = makeLoader(`[${E_ACUTE_NFC}]`);
    const baseIr = irProducing([E_ACUTE_NFC]);
    const result = await suggestMissingCharacters({ bcp47: "fr", baseIr, loader });
    expect(result).not.toBeNull();
    expect(result!.main).not.toContain(E_ACUTE_NFC);
  });

  it("CLDR has precomposed e-acute; base emits decomposed e + combining via two char elements — NOT suggested (run-merge NFC)", async () => {
    // buildProducedSet run-merges consecutive char elements and NFC-normalizes,
    // so e + U+0301 → é (U+00E9). The suggestion should NOT appear.
    const loader = makeLoader(`[${E_ACUTE_NFC}]`);
    const baseIr = makeTestIR([
      makeGroup([
        makeRule([
          { kind: "char", value: E_ACUTE_NFD_E },
          { kind: "char", value: E_ACUTE_NFD_COMBINING },
        ]),
      ]),
    ]);
    const result = await suggestMissingCharacters({ bcp47: "fr", baseIr, loader });
    expect(result).not.toBeNull();
    expect(result!.main).not.toContain(E_ACUTE_NFC);
  });
});

// ---------------------------------------------------------------------------
// 6. Case coverage (non-Turkic locale)
// ---------------------------------------------------------------------------

describe("suggestMissingCharacters — case coverage (non-Turkic)", () => {
  it("base produces uppercase Ọ; CLDR has lowercase ọ — ọ is covered, NOT suggested", async () => {
    // ọ = U+1ECD (lowercase), Ọ = U+1ECC (uppercase)
    const loader = makeLoader("[ọ]"); // ọ
    const baseIr = irProducing(["Ọ"]); // Ọ (uppercase)
    const result = await suggestMissingCharacters({ bcp47: "yo", baseIr, loader });
    expect(result).not.toBeNull();
    // lowercase ọ must NOT be suggested because uppercase Ọ covers it
    expect(result!.main).not.toContain("ọ");
  });

  it("base produces lowercase ọ; CLDR has lowercase ọ — NOT suggested", async () => {
    const loader = makeLoader("[ọ]");
    const baseIr = irProducing(["ọ"]);
    const result = await suggestMissingCharacters({ bcp47: "yo", baseIr, loader });
    expect(result).not.toBeNull();
    expect(result!.main).not.toContain("ọ");
  });

  it("base produces nothing; CLDR has lowercase ọ — IS suggested", async () => {
    const loader = makeLoader("[ọ]");
    const result = await suggestMissingCharacters({ bcp47: "yo", baseIr: emptyIr, loader });
    expect(result).not.toBeNull();
    expect(result!.main).toContain("ọ");
  });
});

// ---------------------------------------------------------------------------
// 7. Turkic case-folding exception
// ---------------------------------------------------------------------------

describe("suggestMissingCharacters — Turkic case-folding exception", () => {
  it("tr locale: base produces I/i; CLDR has dotless-i U+0131 — IS suggested (no JS case-fold)", async () => {
    // U+0131 = ı (dotless i, lowercase Turkic)
    // JS 'I'.toLowerCase() returns 'i', not 'ı', so case folding must be SKIPPED.
    // The base has 'I' and 'i' but NOT 'ı', so 'ı' must be suggested.
    const loader = makeLoader("[ı]"); // ı
    const baseIr = irProducing(["I", "i"]);
    const result = await suggestMissingCharacters({ bcp47: "tr", baseIr, loader });
    expect(result).not.toBeNull();
    // ı (U+0131) must appear in the suggestion list because Turkic exact-NFC-only matching
    // means 'I'/'i' do NOT cover 'ı'.
    expect(result!.main).toContain("ı");
  });

  it("az locale: same dotless-i behavior as tr", async () => {
    const loader = makeLoader("[ı]");
    const baseIr = irProducing(["I", "i"]);
    const result = await suggestMissingCharacters({ bcp47: "az", baseIr, loader });
    expect(result).not.toBeNull();
    expect(result!.main).toContain("ı");
  });

  // az-Latn → explicit Latin script, default is also Latin → suppressed (explicit-subtag branch)
  it("az-Latn: explicit Latin script — case-fold suppressed, dotless-i IS suggested", async () => {
    // Exercises the explicit-script branch of effectiveScriptIsLatin for a locale
    // whose default is also Latin (contrast: kk-Latn exercises the same branch for a
    // Cyrillic-default locale). Both must reach the same suppressed outcome.
    const loader = makeLoader("[ı]");
    const baseIr = irProducing(["I", "i"]);
    const result = await suggestMissingCharacters({ bcp47: "az-Latn", baseIr, loader });
    expect(result).not.toBeNull();
    expect(result!.main).toContain("ı");
  });

  // kk bare → Cyrillic default → case-fold applies (NOT suppressed)
  it("bare kk locale: Cyrillic default — case-fold applies, Cyrillic case pair IS covered", async () => {
    // ә (U+04D9, Cyrillic small letter schwa) and Ә (U+04D8, capital).
    // With case-fold: base produces Ә (uppercase), ә is covered → NOT suggested.
    const loader = makeLoader("[ә]"); // lowercase ә
    const baseIr = irProducing(["Ә"]); // uppercase Ә
    const result = await suggestMissingCharacters({ bcp47: "kk", baseIr, loader });
    expect(result).not.toBeNull();
    // ә must NOT be suggested — covered via JS case-fold (Cyrillic, not suppressed)
    expect(result!.main).not.toContain("ә");
  });

  it("bare kk locale: Cyrillic default — ı (dotless-i) is covered by I via toUpperCase fold", async () => {
    // With case-fold enabled (Cyrillic kk), isCovered checks toUpperCase:
    // "ı".toUpperCase() === "I" (JS standard), and the base has "I" → ı IS covered.
    // This is correct: the dotted-I hazard only matters for suppression
    // (where we fear fold in the wrong direction). Here we fold correctly.
    const loader = makeLoader("[ı]");
    const baseIr = irProducing(["I", "i"]);
    const result = await suggestMissingCharacters({ bcp47: "kk", baseIr, loader });
    expect(result).not.toBeNull();
    // ı is NOT suggested — covered via toUpperCase() fold ("ı" → "I" present in base)
    expect(result!.main).not.toContain("ı");
  });

  // kk-Latn → explicit Latin script → suppressed
  it("kk-Latn: Latin script — case-fold suppressed, dotless-i IS suggested", async () => {
    const loader = makeLoader("[ı]");
    const baseIr = irProducing(["I", "i"]);
    const result = await suggestMissingCharacters({ bcp47: "kk-Latn", baseIr, loader });
    expect(result).not.toBeNull();
    expect(result!.main).toContain("ı");
  });

  // kk-Latn-KZ → explicit Latin script + region → suppressed
  it("kk-Latn-KZ: Latin script + region — case-fold suppressed, dotless-i IS suggested", async () => {
    const loader = makeLoader("[ı]");
    const baseIr = irProducing(["I", "i"]);
    const result = await suggestMissingCharacters({ bcp47: "kk-Latn-KZ", baseIr, loader });
    expect(result).not.toBeNull();
    expect(result!.main).toContain("ı");
  });

  // kk-Cyrl → explicit Cyrillic script → NOT suppressed, Cyrillic case pair covered
  it("kk-Cyrl: explicit Cyrillic script — case-fold applies, Cyrillic case pair covered", async () => {
    const loader = makeLoader("[ә]"); // lowercase ә
    const baseIr = irProducing(["Ә"]); // uppercase Ә
    const result = await suggestMissingCharacters({ bcp47: "kk-Cyrl", baseIr, loader });
    expect(result).not.toBeNull();
    expect(result!.main).not.toContain("ә");
  });

  // kk-KZ → region only, no explicit script → Cyrillic default → NOT suppressed
  it("kk-KZ: region suffix, no explicit script — Cyrillic default, case-fold applies", async () => {
    const loader = makeLoader("[ә]"); // lowercase ә
    const baseIr = irProducing(["Ә"]); // uppercase Ә
    const result = await suggestMissingCharacters({ bcp47: "kk-KZ", baseIr, loader });
    expect(result).not.toBeNull();
    expect(result!.main).not.toContain("ә");
  });

  // az-Cyrl → explicit Cyrillic → NOT suppressed (contrast with bare az which stays suppressed)
  it("az-Cyrl: explicit Cyrillic — NOT suppressed; ı covered by I via toUpperCase fold", async () => {
    // With case-fold enabled (az-Cyrl), "ı".toUpperCase() === "I" → base covers ı.
    // Contrast with bare "az" (Latin default, suppressed) where I/i do NOT cover ı.
    const loader = makeLoader("[ı]");
    const baseIr = irProducing(["I", "i"]);
    const result = await suggestMissingCharacters({ bcp47: "az-Cyrl", baseIr, loader });
    expect(result).not.toBeNull();
    // ı NOT suggested — case-fold enabled, "ı".toUpperCase()="I" is in base
    expect(result!.main).not.toContain("ı");
  });

  it("az-Cyrl: Cyrillic case pair IS covered via case-fold (not suppressed)", async () => {
    // Azerbaijani Cyrillic letter ə (U+0259) and Ə (U+018F).
    // With case-fold enabled: Ə covers ə → ə NOT suggested.
    const loader = makeLoader("[ə]"); // U+0259 lowercase schwa
    const baseIr = irProducing(["Ə"]); // U+018F uppercase schwa
    const result = await suggestMissingCharacters({ bcp47: "az-Cyrl", baseIr, loader });
    expect(result).not.toBeNull();
    expect(result!.main).not.toContain("ə");
  });

  it("non-Turkic (yo) locale: I covers i via case-fold — i not suggested", async () => {
    // For a non-Turkic locale, if base produces uppercase I, lowercase 'i' should be
    // considered covered via JS toLowerCase. But 'i' is ASCII (cp <= 0x7F) so
    // letterFilter drops it anyway — so we test with a non-ASCII char pair instead.
    // ọ (U+1ECD) and Ọ (U+1ECC) — non-Turkic: uppercase covers lowercase.
    const loader = makeLoader("[ọ]"); // ọ
    const baseIr = irProducing(["Ọ"]); // Ọ uppercase
    const result = await suggestMissingCharacters({ bcp47: "yo", baseIr, loader });
    expect(result).not.toBeNull();
    expect(result!.main).not.toContain("ọ");
  });
});

// ---------------------------------------------------------------------------
// 8. Nothing missing — empty main + auxiliary, non-null result
// ---------------------------------------------------------------------------

describe("suggestMissingCharacters — keyboard covers all CLDR chars", () => {
  it("returns non-null result with empty main and auxiliary arrays when base covers everything", async () => {
    // ẹ (U+1EB9) and ọ (U+1ECD) are in CLDR; base produces both
    const loader = makeLoader("[ẹ ọ]", "[é]");
    const baseIr = irProducing(["ẹ", "ọ", "é"]);
    const result = await suggestMissingCharacters({ bcp47: "yo", baseIr, loader });
    expect(result).not.toBeNull();
    expect(result!.main).toEqual([]);
    expect(result!.auxiliary).toEqual([]);
  });

  it("empty main array alone (base covers main, no auxiliary) — non-null, both empty", async () => {
    const loader = makeLoader("[ẹ]", null);
    const baseIr = irProducing(["ẹ"]);
    const result = await suggestMissingCharacters({ bcp47: "yo", baseIr, loader });
    expect(result).not.toBeNull();
    expect(result!.main).toEqual([]);
    expect(result!.auxiliary).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 9. Auxiliary tier
// ---------------------------------------------------------------------------

describe("suggestMissingCharacters — auxiliary tier", () => {
  it("char absent from main and base appears in auxiliary", async () => {
    // main: ẹ (U+1EB9); auxiliary: ü (U+00FC)
    // base produces nothing
    const loader = makeLoader("[ẹ]", "[ü]");
    const result = await suggestMissingCharacters({ bcp47: "yo", baseIr: emptyIr, loader });
    expect(result).not.toBeNull();
    expect(result!.main).toContain("ẹ");
    expect(result!.auxiliary).toContain("ü");
  });

  it("char in BOTH main and auxiliary appears only in main (not auxiliary)", async () => {
    // ẹ appears in both; it should be in main only, NOT duplicated in auxiliary
    const loader = makeLoader("[ẹ]", "[ẹ ü]");
    const result = await suggestMissingCharacters({ bcp47: "yo", baseIr: emptyIr, loader });
    expect(result).not.toBeNull();
    expect(result!.main).toContain("ẹ");
    // ẹ must NOT appear in auxiliary (deduplicated against main)
    expect(result!.auxiliary).not.toContain("ẹ");
    // ü should still appear in auxiliary
    expect(result!.auxiliary).toContain("ü");
  });

  it("auxiliary char already produced by base is NOT suggested in auxiliary", async () => {
    const loader = makeLoader("[ẹ]", "[ü]");
    const baseIr = irProducing(["ü"]); // base produces ü
    const result = await suggestMissingCharacters({ bcp47: "yo", baseIr, loader });
    expect(result).not.toBeNull();
    expect(result!.auxiliary).not.toContain("ü");
  });

  it("auxiliary sorted ascending by codepoint", async () => {
    // ü (U+00FC=252) before ö (U+00F6=246) in the CLDR string — result must be ascending
    const loader = makeLoader("[ẹ]", "[ü ö]");
    const result = await suggestMissingCharacters({ bcp47: "yo", baseIr: emptyIr, loader });
    expect(result).not.toBeNull();
    const cps = result!.auxiliary.map((c) => c.codePointAt(0)!);
    for (let i = 1; i < cps.length; i++) {
      expect(cps[i]!).toBeGreaterThanOrEqual(cps[i - 1]!);
    }
  });

  it("null auxiliary from CLDR yields empty auxiliary array (non-null result)", async () => {
    const loader = makeLoader("[ẹ]", null); // no auxiliary data
    const result = await suggestMissingCharacters({ bcp47: "yo", baseIr: emptyIr, loader });
    expect(result).not.toBeNull();
    expect(result!.auxiliary).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 10. Digraph filter mismatch — multi-codepoint CLDR clusters excluded
// ---------------------------------------------------------------------------

describe("suggestMissingCharacters — digraph clusters excluded from suggestions", () => {
  it("CLDR main set with bracketed digraph {gb} and missing single letter ọ: digraph absent, ọ present", async () => {
    // parseUnicodeSet records {gb} in `specials` via its unanchored /\p{L}/u test.
    // letterFilter's anchored /^\p{L}$/u rejects "gb" (multi-codepoint string),
    // so it must NOT appear in the suggestion output.
    // ọ (U+1ECD) is a single non-ASCII letter and IS missing from the empty base.
    const loader = makeLoader("[a b {gb} ọ]");
    const result = await suggestMissingCharacters({ bcp47: "yo", baseIr: emptyIr, loader });
    expect(result).not.toBeNull();
    // Digraph "gb" must NOT appear in main suggestions
    expect(result!.main).not.toContain("gb");
    // Single missing letter ọ MUST appear
    expect(result!.main).toContain("ọ");
  });
});

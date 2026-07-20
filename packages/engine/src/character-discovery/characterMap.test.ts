import { describe, it, expect } from "vitest";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import type { CldrFullLoader } from "./cldr.js";
import { buildCharacterMap, CHARACTER_MAP_BLOCKS } from "./characterMap.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeIR(bcp47: string[] = []): KeyboardIR {
  return {
    origin: "imported",
    header: {
      keyboardId: "test",
      name: "Test",
      bcp47,
      copyright: "",
      version: "1.0",
      targets: [],
      storeDirectives: [],
    },
    stores: [],
    groups: [],
    comments: [],
    raw: [],
    recognizedPatterns: [],
  } as KeyboardIR;
}

// Bambara-ish fixture: main exemplars include ASCII + IPA-Extensions letters
// (ɛ, ɔ, ŋ) and a bare combining acute; auxiliary carries a loanword letter.
const bmLoader: CldrFullLoader = async (locale) =>
  locale === "bm"
    ? { main: "[a b c ɛ ɔ ŋ ́]", auxiliary: "[q]" }
    : null;

function allCells(groups: Awaited<ReturnType<typeof buildCharacterMap>>) {
  return groups.flatMap((g) => g.cells);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildCharacterMap", () => {
  it("main tier contains CLDR main exemplars", async () => {
    const groups = await buildCharacterMap(makeIR(), "bm", "Bambara", bmLoader);
    const mainChars = groups.filter((g) => g.tier === "main").flatMap((g) => g.cells.map((c) => c.char));
    expect(mainChars).toEqual(expect.arrayContaining(["a", "b", "c", "ɛ", "ɔ", "ŋ"]));
  });

  it("auxiliary tier contains CLDR auxiliary exemplars", async () => {
    const groups = await buildCharacterMap(makeIR(), "bm", "Bambara", bmLoader);
    const auxChars = groups.filter((g) => g.tier === "auxiliary").flatMap((g) => g.cells.map((c) => c.char));
    expect(auxChars).toContain("q");
  });

  it("block tier includes Latin Extended-A and Latin Extended Additional chars", async () => {
    const groups = await buildCharacterMap(makeIR(), "bm", "Bambara", bmLoader);
    const blockChars = groups.filter((g) => g.tier === "block").flatMap((g) => g.cells.map((c) => c.char));
    // U+0133 LATIN SMALL LIGATURE IJ (Latin Extended-A)
    expect(blockChars).toContain("ĳ");
    // U+1EB8 LATIN CAPITAL LETTER E WITH CIRCUMFLEX AND DOT BELOW (Latin Extended Additional)
    expect(blockChars).toContain("Ẹ");
  });

  it("groups the block tier under the expected human-readable block names", async () => {
    const groups = await buildCharacterMap(makeIR(), "bm", "Bambara", bmLoader);
    const blockNames = groups.filter((g) => g.tier === "block").map((g) => g.block);
    expect(blockNames).toContain("Latin Extended-A");
    expect(blockNames).toContain("Latin Extended Additional");
  });

  it("flags combining marks with isCombiningMark: true, everything else false", async () => {
    const groups = await buildCharacterMap(makeIR(), "bm", "Bambara", bmLoader);
    const cells = allCells(groups);
    const combiningAcute = cells.find((c) => c.char === "́");
    expect(combiningAcute?.isCombiningMark).toBe(true);
    const plainA = cells.find((c) => c.char === "a");
    expect(plainA?.isCombiningMark).toBe(false);
  });

  it("excludes control chars and PUA from every tier", async () => {
    // A hostile loader surfacing a control char (U+0001) and a PUA char
    // (U+E000) alongside real exemplars, proving the guardrail strips them
    // rather than trusting CLDR-shaped input blindly.
    const hostileLoader: CldrFullLoader = async () => ({
      main: "[a \u0001 \ue000 \u025b]",
      auxiliary: null,
    });
    const groups = await buildCharacterMap(makeIR(), "bm", "Bambara", hostileLoader);
    const chars = allCells(groups).map((c) => c.char);
    expect(chars).not.toContain("\u0001");
    expect(chars).not.toContain("\ue000");
    expect(chars).toContain("a");
    expect(chars).toContain("\u025b");
  });

  it("dedupes globally — no char appears in two cells", async () => {
    const groups = await buildCharacterMap(makeIR(), "bm", "Bambara", bmLoader);
    const cells = allCells(groups);
    const chars = cells.map((c) => c.char);
    expect(new Set(chars).size).toBe(chars.length);
  });

  it("returns groups in tier order: all main, then all auxiliary, then all block", async () => {
    const groups = await buildCharacterMap(makeIR(), "bm", "Bambara", bmLoader);
    const tiers = groups.map((g) => g.tier);
    const firstAux = tiers.indexOf("auxiliary");
    const firstBlock = tiers.indexOf("block");
    const lastMain = tiers.lastIndexOf("main");
    const lastAux = tiers.lastIndexOf("auxiliary");
    if (firstAux !== -1) expect(lastMain).toBeLessThan(firstAux);
    if (firstBlock !== -1) expect(lastAux).toBeLessThan(firstBlock);
  });

  it("falls back to the base keyboard's own bcp47 tag when bcp47 is omitted", async () => {
    const groups = await buildCharacterMap(makeIR(["bm"]), undefined, undefined, bmLoader);
    const mainChars = groups.filter((g) => g.tier === "main").flatMap((g) => g.cells.map((c) => c.char));
    expect(mainChars).toContain("ɛ");
  });

  it("degrades to an empty result when no bcp47 is resolvable and baseIr is null", async () => {
    const groups = await buildCharacterMap(null, undefined, undefined, bmLoader);
    expect(groups).toEqual([]);
  });

  it("CHARACTER_MAP_BLOCKS is a separate table scoped to Latn/Cyrl/Arab/Deva", () => {
    expect(Object.keys(CHARACTER_MAP_BLOCKS).sort()).toEqual(["Arab", "Cyrl", "Deva", "Latn"]);
  });

  it("Cyrl block tier surfaces the combining acute under Combining Diacritical Marks", async () => {
    // No CLDR data needed — the combining acute lives in the "block" tier,
    // which is driven purely by the resolved script's CHARACTER_MAP_BLOCKS
    // entry. "xx-Cyrl" forces script resolution via the explicit BCP47 script
    // subtag so this doesn't depend on a real langtags default.
    const groups = await buildCharacterMap(makeIR(), "xx-Cyrl", undefined, async () => null);
    const combiningGroup = groups.find(
      (g) => g.tier === "block" && g.block === "Combining Diacritical Marks",
    );
    expect(combiningGroup).toBeDefined();
    const acute = combiningGroup?.cells.find((c) => c.char === "́");
    expect(acute?.isCombiningMark).toBe(true);
  });

  it("excludes noncharacters (e.g. U+FDD0) from every tier", async () => {
    const NONCHARACTER = "﷐";
    const hostileLoader: CldrFullLoader = async () => ({
      main: `[a ${NONCHARACTER}]`,
      auxiliary: null,
    });
    const groups = await buildCharacterMap(makeIR(), "bm", "Bambara", hostileLoader);
    const chars = allCells(groups).map((c) => c.char);
    expect(chars).not.toContain(NONCHARACTER);
    expect(chars).toContain("a");
  });

  it("format-char guardrail excludes soft hyphen but retains the bidi-allowlisted LRM", async () => {
    // Both U+00AD (SOFT HYPHEN) and U+200E (LRM) are General_Category Cf, so
    // this exercises the isBidiControlCodePoint allowlist branch of
    // isGuardrailExcluded rather than just the blanket Cf exclusion.
    const SOFT_HYPHEN = "­";
    const LRM = "‎";
    const hostileLoader: CldrFullLoader = async () => ({
      main: `[a ${SOFT_HYPHEN} ${LRM}]`,
      auxiliary: null,
    });
    const groups = await buildCharacterMap(makeIR(), "bm", "Bambara", hostileLoader);
    const chars = allCells(groups).map((c) => c.char);
    expect(chars).not.toContain(SOFT_HYPHEN);
    expect(chars).toContain(LRM);
    expect(chars).toContain("a");
  });
});

import { describe, it, expect } from "vitest";
import type { IRGroup, KeyboardIR } from "@keyboard-studio/contracts";
import type { CldrFullLoader } from "./cldr.js";
import { buildCharacterMap, CHARACTER_MAP_BLOCKS, isCombiningMarkChar } from "./characterMap.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeIR(bcp47: string[] = [], groups: IRGroup[] = []): KeyboardIR {
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
    groups,
    comments: [],
    raw: [],
    recognizedPatterns: [],
  } as KeyboardIR;
}

/** A minimal group/rule producing the given literal char output — used to
 * give a fixture IR a non-empty producedGlyphs() set for usedByBase tests. */
function makeProducingGroup(chars: readonly string[]): IRGroup {
  return {
    nodeId: "group#produces",
    name: "main",
    usingKeys: true,
    readonly: false,
    rules: chars.map((ch, i) => ({
      nodeId: `rule#${i}`,
      context: [{ kind: "vkey", name: `K_${i}`, modifiers: [] }],
      output: [{ kind: "char", value: ch }],
    })),
  };
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
    const groups = await buildCharacterMap(makeIR(), "bm", "Bambara", { loader: bmLoader });
    const mainChars = groups.filter((g) => g.tier === "main").flatMap((g) => g.cells.map((c) => c.char));
    expect(mainChars).toEqual(expect.arrayContaining(["a", "b", "c", "ɛ", "ɔ", "ŋ"]));
  });

  it("auxiliary tier contains CLDR auxiliary exemplars", async () => {
    const groups = await buildCharacterMap(makeIR(), "bm", "Bambara", { loader: bmLoader });
    const auxChars = groups.filter((g) => g.tier === "auxiliary").flatMap((g) => g.cells.map((c) => c.char));
    expect(auxChars).toContain("q");
  });

  it("block tier includes Latin Extended-A and Latin Extended Additional chars", async () => {
    const groups = await buildCharacterMap(makeIR(), "bm", "Bambara", { loader: bmLoader });
    const blockChars = groups.filter((g) => g.tier === "block").flatMap((g) => g.cells.map((c) => c.char));
    // U+0133 LATIN SMALL LIGATURE IJ (Latin Extended-A)
    expect(blockChars).toContain("ĳ");
    // U+1EB8 LATIN CAPITAL LETTER E WITH CIRCUMFLEX AND DOT BELOW (Latin Extended Additional)
    expect(blockChars).toContain("Ẹ");
  });

  it("groups the block tier under the expected human-readable block names", async () => {
    const groups = await buildCharacterMap(makeIR(), "bm", "Bambara", { loader: bmLoader });
    const blockNames = groups.filter((g) => g.tier === "block").map((g) => g.block);
    expect(blockNames).toContain("Latin Extended-A");
    expect(blockNames).toContain("Latin Extended Additional");
  });

  it("flags combining marks with isCombiningMark: true, everything else false", async () => {
    const groups = await buildCharacterMap(makeIR(), "bm", "Bambara", { loader: bmLoader });
    const cells = allCells(groups);
    const combiningAcute = cells.find((c) => c.char === "́");
    expect(combiningAcute?.isCombiningMark).toBe(true);
    const plainA = cells.find((c) => c.char === "a");
    expect(plainA?.isCombiningMark).toBe(false);
  });

  it("isCombiningMarkChar: General_Category M (Mn/Mc/Me), widened from the old Mn/Mc-only test — Me marks now flag true, Sk modifier symbols stay false", () => {
    expect(isCombiningMarkChar("̀")).toBe(true); // U+0300 COMBINING GRAVE ACCENT (Mn)
    expect(isCombiningMarkChar("ा")).toBe(true); // U+093E DEVANAGARI VOWEL SIGN AA (Mc, ccc=0)
    expect(isCombiningMarkChar("⃝")).toBe(true); // U+20DD COMBINING ENCLOSING CIRCLE (Me)
    expect(isCombiningMarkChar("´")).toBe(false); // U+00B4 ACUTE ACCENT (Sk) — free-standing, not a mark
    expect(isCombiningMarkChar("a")).toBe(false);
  });

  it("excludes control chars and PUA from every tier", async () => {
    // A hostile loader surfacing a control char (U+0001) and a PUA char
    // (U+E000) alongside real exemplars, proving the guardrail strips them
    // rather than trusting CLDR-shaped input blindly.
    const hostileLoader: CldrFullLoader = async () => ({
      main: "[a \u0001 \ue000 \u025b]",
      auxiliary: null,
    });
    const groups = await buildCharacterMap(makeIR(), "bm", "Bambara", { loader: hostileLoader });
    const chars = allCells(groups).map((c) => c.char);
    expect(chars).not.toContain("\u0001");
    expect(chars).not.toContain("\ue000");
    expect(chars).toContain("a");
    expect(chars).toContain("\u025b");
  });

  it("lists a character regardless of whether any installed font can render it — the ONLY filter is the guardrail (control/PUA/noncharacter/unassigned/format), never font glyph coverage", async () => {
    // Adlam is a Unicode Supplementary Multilingual Plane script (U+1E900+)
    // that most systems' default font stacks do NOT have installed glyphs
    // for — exactly the case Requirement 1 (studio-side box fallback) exists
    // to handle. buildCharacterMap has no font awareness anywhere (grep the
    // module: no `font`, `canvas`, or `document` reference at all) — its
    // only exclusion is isGuardrailExcluded (control/PUA/noncharacter/
    // unassigned/format). This locks in that font support is never a
    // filtering criterion at the engine layer; the studio is solely
    // responsible for choosing glyph-vs-box display for what this function
    // returns.
    const groups = await buildCharacterMap(makeIR(), "xx-Adlm", undefined, async () => null);
    const blockChars = groups.filter((g) => g.tier === "block").flatMap((g) => g.cells.map((c) => c.char));
    // U+1E900 ADLAM CAPITAL LETTER ALIF
    expect(blockChars).toContain("𞤀");
  });

  it("dedupes globally — no char appears in two cells", async () => {
    const groups = await buildCharacterMap(makeIR(), "bm", "Bambara", { loader: bmLoader });
    const cells = allCells(groups);
    const chars = cells.map((c) => c.char);
    expect(new Set(chars).size).toBe(chars.length);
  });

  it("returns groups in tier order: all main, then all auxiliary, then all block", async () => {
    const groups = await buildCharacterMap(makeIR(), "bm", "Bambara", { loader: bmLoader });
    const tiers = groups.map((g) => g.tier);
    const firstAux = tiers.indexOf("auxiliary");
    const firstBlock = tiers.indexOf("block");
    const lastMain = tiers.lastIndexOf("main");
    const lastAux = tiers.lastIndexOf("auxiliary");
    if (firstAux !== -1) expect(lastMain).toBeLessThan(firstAux);
    if (firstBlock !== -1) expect(lastAux).toBeLessThan(firstBlock);
  });

  it("falls back to the base keyboard's own bcp47 tag when bcp47 is omitted", async () => {
    const groups = await buildCharacterMap(makeIR(["bm"]), undefined, undefined, { loader: bmLoader });
    const mainChars = groups.filter((g) => g.tier === "main").flatMap((g) => g.cells.map((c) => c.char));
    expect(mainChars).toContain("ɛ");
  });

  it("still enumerates CURATED_SCRIPTS' block/digits/punctuation tiers when no bcp47 is resolvable and baseIr is null", async () => {
    // main/auxiliary (no CLDR locale to resolve) stay empty. digits/
    // punctuation are script-agnostic and always populate from their Common
    // fold, same as before. UNLIKE before this cycle, block/digits/
    // punctuation are NOT limited to the Common fold: CURATED_SCRIPTS is
    // always part of the enumeration set regardless of whether a target
    // script resolves, so e.g. Greek/Cyrillic letters also surface — an
    // author can browse major scripts unrelated to any resolved language.
    const groups = await buildCharacterMap(null, undefined, undefined, { loader: bmLoader });
    const tiers = groups.map((g) => g.tier);
    expect(tiers).not.toContain("main");
    expect(tiers).not.toContain("auxiliary");
    const blockChars = groups.filter((g) => g.tier === "block").flatMap((g) => g.cells.map((c) => c.char));
    expect(blockChars).toContain("ʻ"); // U+02BB, the Common-scoped modifier-letter fold
    expect(blockChars).toContain("α"); // U+03B1 GREEK SMALL LETTER ALPHA — Grek is curated
    const digitChars = groups.filter((g) => g.tier === "digits").flatMap((g) => g.cells.map((c) => c.char));
    expect(digitChars).toContain("0");
    const punctChars = groups.filter((g) => g.tier === "punctuation").flatMap((g) => g.cells.map((c) => c.char));
    expect(punctChars).toContain(".");
  });

  it("CHARACTER_MAP_BLOCKS carries every CURATED_SCRIPTS member except Syrc, plus Common", () => {
    // Was scoped to just Latn/Cyrl/Arab/Deva; now every CURATED_SCRIPTS
    // script gets its primary block (Syrc excepted) plus a "Common" entry
    // for the script-neutral folds (see blockNameFor/COMMON_PUNCTUATION_RANGES).
    expect(Object.keys(CHARACTER_MAP_BLOCKS).sort()).toEqual([
      "Adlm",
      "Arab",
      "Armn",
      "Beng",
      "Cher",
      "Common",
      "Cyrl",
      "Deva",
      "Ethi",
      "Geor",
      "Grek",
      "Hebr",
      "Hira",
      "Kana",
      "Khmr",
      "Knda",
      "Laoo",
      "Latn",
      "Mlym",
      "Mymr",
      "Nkoo",
      "Sinh",
      "Taml",
      "Telu",
      "Thaa",
      "Thai",
      "Tibt",
      "Yiii",
    ]);
  });

  it("Cyrl enumeration surfaces the combining acute in the block tier, tagged 'Cyrl' (the gathering script), not 'Inherited'", async () => {
    // The combining acute (U+0301) has PRIMARY Unicode Script=Inherited, but
    // its Script_Extensions includes Cyrl — and Cyrl is the resolved target
    // script here (so it leads the enumeration order), meaning Cyrl's own
    // categorizeScriptChars() call is the FIRST to gather it. It is now
    // attributed to "Cyrl" (the gathering script), not a Common/Inherited
    // sentinel — this is the fix: foreign-script combining marks hide with
    // their script under the studio's scripts-only filter. Cyrl's own
    // CHARACTER_MAP_BLOCKS table carries a "Combining Diacritical Marks"
    // entry (U+0300-036F), so the group picks up that curated name rather
    // than falling back to the generic "Letters" label. "xx-Cyrl" forces
    // script resolution via the explicit BCP47 script subtag so this doesn't
    // depend on a real langtags default.
    const groups = await buildCharacterMap(makeIR(), "xx-Cyrl", undefined, { loader: async () => null });
    const cyrlGroup = groups.find(
      (g) => g.tier === "block" && g.script === "Cyrl" && g.block === "Combining Diacritical Marks",
    );
    expect(cyrlGroup).toBeDefined();
    const acute = cyrlGroup?.cells.find((c) => c.char === "́");
    expect(acute).toBeDefined();
    expect(acute?.isCombiningMark).toBe(true);
    expect(groups.some((g) => g.script === "Inherited")).toBe(false);
  });

  it("excludes noncharacters (e.g. U+FDD0) from every tier", async () => {
    const NONCHARACTER = "﷐";
    const hostileLoader: CldrFullLoader = async () => ({
      main: `[a ${NONCHARACTER}]`,
      auxiliary: null,
    });
    const groups = await buildCharacterMap(makeIR(), "bm", "Bambara", { loader: hostileLoader });
    const chars = allCells(groups).map((c) => c.char);
    expect(chars).not.toContain(NONCHARACTER);
    expect(chars).toContain("a");
  });

  it("Ethiopic (Ethi) block tier yields letters under the curated 'Ethiopic' block name", async () => {
    // Ethi now has a curated primary-block entry in CHARACTER_MAP_BLOCKS
    // (U+1200-137F "Ethiopic") — updated from the pre-fix generic "Letters"
    // fallback the script used to collapse to.
    const groups = await buildCharacterMap(makeIR(), "xx-Ethi", undefined, { loader: async () => null });
    const blockChars = groups.filter((g) => g.tier === "block").flatMap((g) => g.cells.map((c) => c.char));
    expect(blockChars).toContain("ሀ"); // U+1200 ETHIOPIC SYLLABLE HA
    const blockNames = groups.filter((g) => g.tier === "block").map((g) => g.block);
    expect(blockNames).toContain("Ethiopic");
  });

  it("Ethiopic digits tier surfaces \\p{No} numerals (not \\p{Nd})", async () => {
    // Ethiopic numerals (U+1369-137C) are General_Category No, not Nd —
    // a digit filter of \p{Nd} alone would silently drop this whole script.
    const groups = await buildCharacterMap(makeIR(), "xx-Ethi", undefined, { loader: async () => null });
    const digitChars = groups.filter((g) => g.tier === "digits").flatMap((g) => g.cells.map((c) => c.char));
    expect(digitChars).toContain("፩"); // U+1369 ETHIOPIC DIGIT ONE
    const digitNames = groups.filter((g) => g.tier === "digits").map((g) => g.block);
    expect(digitNames).toContain("Digits");
  });

  it("Ethiopic digits tier is unbroken for a bare Amharic ('am') tag after dropping \\p{Nl}", async () => {
    const groups = await buildCharacterMap(makeIR(), "am", undefined, { loader: async () => null });
    const digitChars = groups.filter((g) => g.tier === "digits").flatMap((g) => g.cells.map((c) => c.char));
    expect(digitChars).toContain("፩"); // U+1369 ETHIOPIC DIGIT ONE
  });

  it("Ethiopic punctuation tier surfaces script punctuation", async () => {
    const groups = await buildCharacterMap(makeIR(), "xx-Ethi", undefined, { loader: async () => null });
    const punctChars = groups.filter((g) => g.tier === "punctuation").flatMap((g) => g.cells.map((c) => c.char));
    expect(punctChars).toContain("።"); // U+1362 ETHIOPIC FULL STOP
  });

  it("Bengali (Beng) block/digits/punctuation tiers all populate via full-script enumeration", async () => {
    const groups = await buildCharacterMap(makeIR(), "xx-Beng", undefined, { loader: async () => null });
    const byTier = (t: "block" | "digits" | "punctuation") =>
      groups.filter((g) => g.tier === t).flatMap((g) => g.cells.map((c) => c.char));
    expect(byTier("block")).toContain("ক"); // U+995 BENGALI LETTER KA
    expect(byTier("digits")).toContain("০"); // U+9E6 BENGALI DIGIT ZERO
    expect(byTier("punctuation")).toContain("।"); // U+964 DEVANAGARI DANDA (shared, Script_Extensions incl. Beng)
  });

  it("Thai (Thai) block/digits/punctuation tiers all populate via full-script enumeration", async () => {
    const groups = await buildCharacterMap(makeIR(), "xx-Thai", undefined, { loader: async () => null });
    const byTier = (t: "block" | "digits" | "punctuation") =>
      groups.filter((g) => g.tier === t).flatMap((g) => g.cells.map((c) => c.char));
    expect(byTier("block")).toContain("ก"); // U+E01 THAI CHARACTER KO KAI
    expect(byTier("digits")).toContain("๐"); // U+E50 THAI DIGIT ZERO
    expect(byTier("punctuation")).toContain("๏"); // U+E4F THAI CHARACTER FONGMAN
  });

  it("curated scripts (Latn/Cyrl/Arab/Deva) also gain digits/punctuation tiers now", async () => {
    // Cyrl has no CLDR data wired here — script-only, matching the existing
    // "Cyrl block tier surfaces..." test's pattern.
    const groups = await buildCharacterMap(makeIR(), "xx-Cyrl", undefined, { loader: async () => null });
    const tiers = new Set(groups.map((g) => g.tier));
    expect(tiers.has("digits") || tiers.has("punctuation")).toBe(true);
    const punctChars = groups.filter((g) => g.tier === "punctuation").flatMap((g) => g.cells.map((c) => c.char));
    expect(punctChars).toContain("҂"); // U+482 CYRILLIC THOUSANDS SIGN
  });

  it("global dedupe still holds across all five tiers (main/aux/block/digits/punctuation)", async () => {
    const groups = await buildCharacterMap(makeIR(), "xx-Ethi", undefined, { loader: async () => null });
    const chars = allCells(groups).map((c) => c.char);
    expect(new Set(chars).size).toBe(chars.length);
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
    const groups = await buildCharacterMap(makeIR(), "bm", "Bambara", { loader: hostileLoader });
    const chars = allCells(groups).map((c) => c.char);
    expect(chars).not.toContain(SOFT_HYPHEN);
    expect(chars).toContain(LRM);
    expect(chars).toContain("a");
  });

  it("a Latin language yields ASCII 0-9 in the digits tier and common punctuation in the punctuation tier", async () => {
    // Fix 1: ASCII digits/ordinary punctuation are Script=Common with no
    // Script_Extensions override, so the per-script scx enumeration alone
    // (categorizeScriptChars) never surfaces them for a Latin-script
    // language — the Common-scoped fold-in must.
    const groups = await buildCharacterMap(makeIR(), "xx-Latn", undefined, { loader: async () => null });
    const digitChars = groups.filter((g) => g.tier === "digits").flatMap((g) => g.cells.map((c) => c.char));
    for (const digit of "0123456789") {
      expect(digitChars).toContain(digit);
    }
    const punctChars = groups.filter((g) => g.tier === "punctuation").flatMap((g) => g.cells.map((c) => c.char));
    for (const punct of [".", ",", "?", "!", "(", ")", '"', "'", "-", ":", ";"]) {
      expect(punctChars).toContain(punct);
    }
    // Currency signs are Script=Common (no Script_Extensions override), so the
    // Currency Symbols block must be folded in too — ordinary orthographic
    // characters for many target languages (Naira, Cedi, Euro, Rupee).
    for (const currency of ["€", "₦", "₵", "₹"]) {
      expect(punctChars).toContain(currency);
    }
  });

  it("surfaces U+02BB MODIFIER LETTER TURNED COMMA (the Hawaiian 'okina) in the block tier for an explicit-Latn Hawaiian tag", async () => {
    // Fix: U+02BB is Script=Common with no Script_Extensions override, so no
    // per-script scx enumeration ever matches it — it appeared in NO tier for
    // ANY language before the Common-scoped modifier-letter fold.
    const groups = await buildCharacterMap(makeIR(), "haw-Latn", undefined, { loader: async () => null });
    const blockChars = groups.filter((g) => g.tier === "block").flatMap((g) => g.cells.map((c) => c.char));
    expect(blockChars).toContain("ʻ"); // U+02BB MODIFIER LETTER TURNED COMMA
  });

  it("surfaces U+02BB in the block tier for a bare Hawaiian tag (script resolved via langtags default)", async () => {
    const groups = await buildCharacterMap(makeIR(), "haw", undefined, { loader: async () => null });
    const blockChars = groups.filter((g) => g.tier === "block").flatMap((g) => g.cells.map((c) => c.char));
    expect(blockChars).toContain("ʻ");
  });

  it("surfaces U+02BB in the block tier for a plain Latin tag too (the fold applies regardless of resolved script)", async () => {
    const groups = await buildCharacterMap(makeIR(), "xx-Latn", undefined, { loader: async () => null });
    const blockChars = groups.filter((g) => g.tier === "block").flatMap((g) => g.cells.map((c) => c.char));
    expect(blockChars).toContain("ʻ");
  });

  it("an alias ISO 15924 script code (Aran) resolves via SCRIPT_ALIAS_MAP instead of throwing to empty tiers", async () => {
    // Fix 2: `\p{Script_Extensions=Aran}` throws (Aran isn't a Unicode
    // Script property value) — pre-fix, the swallowed throw left every tier
    // empty. Aran maps to Arab.
    const groups = await buildCharacterMap(makeIR(), "xx-Aran", undefined, { loader: async () => null });
    const blockChars = groups.filter((g) => g.tier === "block").flatMap((g) => g.cells.map((c) => c.char));
    expect(blockChars.length).toBeGreaterThan(0);
    expect(blockChars).toContain("ا"); // U+0627 ARABIC LETTER ALEF
  });

  it("excludes \\p{Nl} letter-numbers (e.g. Roman numerals) from the digits tier", async () => {
    // Roman numerals (U+2160.., Script_Extensions=Latn, General_Category Nl)
    // are noise no modern orthography types as digits — including them (a
    // prior fix) polluted the digits tier for every Latin-script language.
    // Ethiopic numerals (General_Category No, NOT Nl) remain covered — see
    // the dedicated Ethiopic digits test below.
    const groups = await buildCharacterMap(makeIR(), "en-Latn", undefined, { loader: async () => null });
    const digitChars = groups.filter((g) => g.tier === "digits").flatMap((g) => g.cells.map((c) => c.char));
    expect(digitChars).not.toContain("Ⅰ"); // U+2160 ROMAN NUMERAL ONE
  });

  it("excludes Roman numerals from the digits tier for a bare 'en' tag too", async () => {
    const groups = await buildCharacterMap(makeIR(), "en", undefined, { loader: async () => null });
    const digitChars = groups.filter((g) => g.tier === "digits").flatMap((g) => g.cells.map((c) => c.char));
    expect(digitChars).not.toContain("Ⅰ");
  });

  it("does not corrupt the per-script cache across repeated calls for the same script", async () => {
    // Fix 3: the per-script cache accessors used to hand back the live
    // cached arrays, which buildCharacterMap() then sorted in place. Two
    // back-to-back calls for the same script must return equal, independent
    // data — mutating the first call's result must not leak into the second.
    const first = await buildCharacterMap(makeIR(), "xx-Cyrl", undefined, { loader: async () => null });
    const second = await buildCharacterMap(makeIR(), "xx-Cyrl", undefined, { loader: async () => null });
    expect(first).toEqual(second);

    // Mutate the first call's result as destructively as possible.
    for (const group of first) {
      group.cells.push({ char: "MUTATED", isCombiningMark: false });
      group.cells.reverse();
    }

    const third = await buildCharacterMap(makeIR(), "xx-Cyrl", undefined, { loader: async () => null });
    expect(third).toEqual(second);
    const thirdChars = third.flatMap((g) => g.cells.map((c) => c.char));
    expect(thirdChars).not.toContain("MUTATED");
  });

  // -------------------------------------------------------------------------
  // Multi-script enumeration + per-character script tagging
  // -------------------------------------------------------------------------

  it("every group carries a script tag", async () => {
    const groups = await buildCharacterMap(makeIR(), "bm", "Bambara", { loader: bmLoader });
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) {
      expect(typeof group.script).toBe("string");
      expect(group.script.length).toBeGreaterThan(0);
    }
  });

  it("baseScripts=['Latn'] with a Cyrillic target yields BOTH Latn and Cyrl groups, correctly tagged", async () => {
    const groups = await buildCharacterMap(makeIR(), "xx-Cyrl", undefined, {
      baseScripts: ["Latn"],
      loader: async () => null,
    });
    const blockGroups = groups.filter((g) => g.tier === "block");
    const cyrlLetters = blockGroups
      .filter((g) => g.script === "Cyrl")
      .flatMap((g) => g.cells.map((c) => c.char));
    const latnLetters = blockGroups
      .filter((g) => g.script === "Latn")
      .flatMap((g) => g.cells.map((c) => c.char));
    expect(cyrlLetters).toContain("а"); // U+0430 CYRILLIC SMALL LETTER A
    expect(latnLetters).toContain("a"); // U+0061 LATIN SMALL LETTER A
    // Other curated scripts (not just target + baseScripts) still appear.
    const grekLetters = blockGroups
      .filter((g) => g.script === "Grek")
      .flatMap((g) => g.cells.map((c) => c.char));
    expect(grekLetters).toContain("α"); // U+03B1 GREEK SMALL LETTER ALPHA
  });

  it("tags a combining mark with its gathering script ('Latn') and ASCII punctuation/digits 'Common'", async () => {
    // No CLDR data (loader returns null) — otherwise the combining acute
    // would be captured by the "main" tier first (global dedupe precedence)
    // rather than surfacing via the "block" tier's full-script enumeration.
    // Latn is the resolved target script and leads the enumeration order, so
    // Latn's categorizeScriptChars() call is the first to gather the acute —
    // it is attributed to "Latn", not a Common/Inherited sentinel.
    const groups = await buildCharacterMap(makeIR(), "xx-Latn", undefined, { loader: async () => null });
    const combiningAcute = groups
      .filter((g) => g.tier === "block")
      .flatMap((g) => g.cells.map((c) => ({ char: c.char, script: g.script })))
      .find((c) => c.char === "́");
    expect(combiningAcute?.script).toBe("Latn");

    const digitZero = groups
      .filter((g) => g.tier === "digits")
      .flatMap((g) => g.cells.map((c) => ({ char: c.char, script: g.script })))
      .find((c) => c.char === "0");
    expect(digitZero?.script).toBe("Common");

    const period = groups
      .filter((g) => g.tier === "punctuation")
      .flatMap((g) => g.cells.map((c) => ({ char: c.char, script: g.script })))
      .find((c) => c.char === ".");
    expect(period?.script).toBe("Common");
  });

  it("attributes a shared char (Devanagari danda) to the ENUMERATING script, not a Common/Inherited sentinel", async () => {
    // U+0964 DEVANAGARI DANDA has primary Script=Common (it's shared
    // punctuation across several Brahmic scripts), but its Script_Extensions
    // includes Beng (Bengali) — Beng is the resolved target script here and
    // leads the enumeration order, so Beng's categorizeScriptChars() call is
    // the first to gather it. It is now tagged "Beng" (the gathering
    // script), which is the fix: a Devanagari/Bengali punctuation mark hides
    // along with its script under the studio's scripts-only filter instead
    // of always showing via a Common sentinel.
    const groups = await buildCharacterMap(makeIR(), "xx-Beng", undefined, { loader: async () => null });
    const danda = groups
      .filter((g) => g.tier === "punctuation")
      .flatMap((g) => g.cells.map((c) => ({ char: c.char, script: g.script })))
      .find((c) => c.char === "।");
    expect(danda?.script).toBe("Beng");
  });

  it("global dedupe still holds across scripts — no char appears in two groups", async () => {
    const groups = await buildCharacterMap(makeIR(), "xx-Cyrl", undefined, {
      baseScripts: ["Latn"],
      loader: async () => null,
    });
    const chars = allCells(groups).map((c) => c.char);
    expect(new Set(chars).size).toBe(chars.length);
  });

  it("attributes Arabic comma (U+060C) and an Arabic combining mark (U+064B) to 'Arab', not a Common/Inherited sentinel", async () => {
    // Both chars are Script=Common/Inherited by PRIMARY Unicode Script, but
    // their Script_Extensions include Arab — with a Latn target/base and
    // Arab enumerated via CURATED_SCRIPTS, Arab's own categorizeScriptChars()
    // call is the only one that gathers them, so they attribute to "Arab".
    // This is the confirmed bug fix: a Latin-based keyboard's scripts-only
    // filter can now hide Arabic punctuation/marks along with the rest of
    // the Arabic script.
    const groups = await buildCharacterMap(makeIR(), "xx-Latn", undefined, {
      baseScripts: ["Latn"],
      loader: async () => null,
    });
    const arabicComma = groups
      .flatMap((g) => g.cells.map((c) => ({ char: c.char, script: g.script })))
      .find((c) => c.char === "،");
    expect(arabicComma?.script).toBe("Arab");

    const arabicMark = groups
      .flatMap((g) => g.cells.map((c) => ({ char: c.char, script: g.script })))
      .find((c) => c.char === "ً");
    expect(arabicMark?.script).toBe("Arab");
  });

  it("no group is ever tagged the retired 'Inherited' sentinel", async () => {
    const groups = await buildCharacterMap(makeIR(), "xx-Latn", undefined, {
      baseScripts: ["Latn"],
      loader: async () => null,
    });
    expect(groups.some((g) => g.script === "Inherited")).toBe(false);
  });

  it("a Latin combining mark (U+0301) attributes to 'Latn', ASCII digit/punctuation attribute to 'Common'", async () => {
    const groups = await buildCharacterMap(makeIR(), "xx-Latn", undefined, {
      baseScripts: ["Latn"],
      loader: async () => null,
    });
    const tagged = groups.flatMap((g) => g.cells.map((c) => ({ char: c.char, script: g.script })));
    expect(tagged.find((c) => c.char === "́")?.script).toBe("Latn");
    expect(tagged.find((c) => c.char === "0")?.script).toBe("Common");
    expect(tagged.find((c) => c.char === ".")?.script).toBe("Common");
  });

  it("a curated script unrelated to the target/base (Grek) still appears", async () => {
    const groups = await buildCharacterMap(makeIR(), "bm", "Bambara", { loader: bmLoader });
    const grekGroups = groups.filter((g) => g.script === "Grek");
    expect(grekGroups.length).toBeGreaterThan(0);
    const grekLetters = grekGroups
      .filter((g) => g.tier === "block")
      .flatMap((g) => g.cells.map((c) => c.char));
    expect(grekLetters).toContain("α"); // U+03B1 GREEK SMALL LETTER ALPHA
  });

  // ---------------------------------------------------------------------------
  // Character NAME lookup
  // ---------------------------------------------------------------------------

  it("populates cell.name for a known Latin letter", async () => {
    const groups = await buildCharacterMap(makeIR(), "bm", "Bambara", { loader: bmLoader });
    const cells = allCells(groups);
    const lowerA = cells.find((c) => c.char === "a");
    expect(lowerA?.name).toBe("LATIN SMALL LETTER A");
    const upperA = cells.find((c) => c.char === "A");
    expect(upperA?.name).toBe("LATIN CAPITAL LETTER A");
  });

  it("populates cell.name for a combining mark", async () => {
    const groups = await buildCharacterMap(makeIR(), "bm", "Bambara", { loader: bmLoader });
    const cells = allCells(groups);
    const combiningAcute = cells.find((c) => c.char === "́");
    expect(combiningAcute?.name).toBe("COMBINING ACUTE ACCENT");
  });

  // ---------------------------------------------------------------------------
  // usedByBase (studio's "blocks my keyboard uses" filter)
  // ---------------------------------------------------------------------------

  it("tags groups containing a produced char usedByBase: true, groups with none usedByBase: false", async () => {
    // The fixture keyboard produces "ĳ" (U+0133, Latin Extended-A) and "0"
    // (Common-scoped ASCII digit) but nothing from Latin Extended Additional
    // or the punctuation tier.
    const groups = await buildCharacterMap(
      makeIR(["xx-Latn"], [makeProducingGroup(["ĳ", "0"])]),
      undefined,
      undefined,
      { loader: async () => null },
    );
    const latinExtendedA = groups.find(
      (g) => g.tier === "block" && g.block === "Latin Extended-A" && g.script === "Latn",
    );
    expect(latinExtendedA?.usedByBase).toBe(true);

    const digits = groups.find((g) => g.tier === "digits" && g.script === "Common");
    expect(digits?.usedByBase).toBe(true);

    const latinExtendedAdditional = groups.find(
      (g) => g.tier === "block" && g.block === "Latin Extended Additional" && g.script === "Latn",
    );
    expect(latinExtendedAdditional?.usedByBase).toBe(false);

    const punctuation = groups.find((g) => g.tier === "punctuation" && g.script === "Common");
    expect(punctuation?.usedByBase).toBe(false);
  });

  it("tags every group usedByBase: false when baseIr is null", async () => {
    const groups = await buildCharacterMap(null, "xx-Latn", undefined, { loader: async () => null });
    expect(groups.length).toBeGreaterThan(0);
    expect(groups.every((g) => g.usedByBase === false)).toBe(true);
  });

  it("degrades to name: undefined (no throw) for a codepoint absent from the name table", async () => {
    // U+E000 (PUA) is guardrail-excluded from every tier already, but exercise
    // the name lookup directly against a codepoint outside its 0x0020..0x2FFFF
    // scope to prove an absent entry degrades gracefully rather than throwing.
    const groups = await buildCharacterMap(makeIR(), "bm", "Bambara", { loader: bmLoader });
    for (const cell of allCells(groups)) {
      expect(() => cell.name).not.toThrow();
    }
    const { loadCharNames } = await import("./charNames.js");
    const names = await loadCharNames();
    expect(names.get(0x30000)).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Block/category labelling — locks the CLASS of fix (curated primary
  // blocks for every uncurated CURATED_SCRIPTS member, plus the mark-aware
  // "Combining marks" fallback), not just one instance.
  // ---------------------------------------------------------------------------

  describe.each([
    ["Grek", "xx-Grek", "α", "Greek and Coptic"], // U+03B1 GREEK SMALL LETTER ALPHA
    ["Armn", "xx-Armn", "ա", "Armenian"], // U+0561 ARMENIAN SMALL LETTER AYB
    ["Geor", "xx-Geor", "ა", "Georgian"], // U+10D0 GEORGIAN LETTER AN
    ["Hebr", "xx-Hebr", "א", "Hebrew"], // U+05D0 HEBREW LETTER ALEF
    ["Thaa", "xx-Thaa", "ހ", "Thaana"], // U+0780 THAANA LETTER HAA
    ["Nkoo", "xx-Nkoo", "ߊ", "NKo"], // U+07CA NKO LETTER A
    ["Adlm", "xx-Adlm", "𞤀", "Adlam"], // U+1E900 ADLAM CAPITAL LETTER ALIF
    ["Cher", "xx-Cher", "Ꭰ", "Cherokee"], // U+13A0 CHEROKEE LETTER A
    ["Beng", "xx-Beng", "ক", "Bengali"], // U+0995 BENGALI LETTER KA
    ["Taml", "xx-Taml", "க", "Tamil"], // U+0B95 TAMIL LETTER KA
    ["Telu", "xx-Telu", "క", "Telugu"], // U+0C15 TELUGU LETTER KA
    ["Knda", "xx-Knda", "ಕ", "Kannada"], // U+0C95 KANNADA LETTER KA
    ["Mlym", "xx-Mlym", "ക", "Malayalam"], // U+0D15 MALAYALAM LETTER KA
    ["Sinh", "xx-Sinh", "අ", "Sinhala"], // U+0D85 SINHALA LETTER AYANNA
    ["Thai", "xx-Thai", "ก", "Thai"], // U+0E01 THAI CHARACTER KO KAI
    ["Laoo", "xx-Laoo", "ກ", "Lao"], // U+0E81 LAO LETTER KO
    ["Mymr", "xx-Mymr", "က", "Myanmar"], // U+1000 MYANMAR LETTER KA
    ["Khmr", "xx-Khmr", "ក", "Khmer"], // U+1780 KHMER LETTER KA
    ["Tibt", "xx-Tibt", "ཀ", "Tibetan"], // U+0F40 TIBETAN LETTER KA
    ["Ethi", "xx-Ethi", "ሀ", "Ethiopic"], // U+1200 ETHIOPIC SYLLABLE HA
    ["Hira", "xx-Hira", "あ", "Hiragana"], // U+3042 HIRAGANA LETTER A
    ["Kana", "xx-Kana", "ア", "Katakana"], // U+30A2 KATAKANA LETTER A
    ["Yiii", "xx-Yiii", "ꀀ", "Yi Syllables"], // U+A000 YI SYLLABLE IT
  ])(
    "previously-uncurated script %s",
    (_script, bcp47, sampleChar, expectedBlockName) => {
      it(`block tier groups ${sampleChar} under the curated '${expectedBlockName}' name, not a generic fallback`, async () => {
        const groups = await buildCharacterMap(makeIR(), bcp47, undefined, { loader: async () => null });
        const group = groups.find(
          (g) => g.tier === "block" && g.cells.some((c) => c.char === sampleChar),
        );
        expect(group).toBeDefined();
        expect(group?.block).toBe(expectedBlockName);
      });
    },
  );

  it("an uncurated script's combining mark (Syriac Pthaha, no CHARACTER_MAP_BLOCKS entry for Syrc) is labelled 'Combining marks', never 'Letters' or the unrelated 'Combining Diacritical Marks' block name", async () => {
    // Syrc is a CURATED_SCRIPTS member with NO curated primary-block entry
    // (deliberately left out — see the audit). U+0730 SYRIAC PTHAHA ABOVE is
    // Mn and its Script_Extensions includes Syrc, so with "xx-Syrc" resolving
    // the target script, Syrc's own categorizeScriptChars() call is the first
    // to gather it and it falls through blockNameFor's curated-range loop.
    const groups = await buildCharacterMap(makeIR(), "xx-Syrc", undefined, { loader: async () => null });
    const mark = groups
      .filter((g) => g.tier === "block")
      .flatMap((g) => g.cells.map((c) => ({ char: c.char, block: g.block, isCombiningMark: c.isCombiningMark })))
      .find((c) => c.char === "ܰ");
    expect(mark).toBeDefined();
    expect(mark?.isCombiningMark).toBe(true);
    expect(mark?.block).toBe("Combining marks");
    expect(mark?.block).not.toBe("Letters");
    expect(mark?.block).not.toBe("Combining Diacritical Marks");
  });
});

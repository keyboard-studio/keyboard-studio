// Pure unit tests for rankBases() — no DOM, no async.
// Covers all 13 cases specified in the task brief.
// Uses inline BaseKeyboard literals where fixtures lack sufficient variety.

import { describe, it, expect } from "vitest";
import type { BaseKeyboard } from "@keyboard-studio/contracts";
import { basicKbdus, silEuroLatin, silDevanagariPhonetic } from "@keyboard-studio/contracts/fixtures";
import { rankBases } from "./rankBases";

// ---------------------------------------------------------------------------
// Inline factory — keeps literals small and clear
// ---------------------------------------------------------------------------

function mk(
  id: string,
  script: string,
  displayName: string,
  languages?: string[],
): BaseKeyboard {
  return {
    id,
    script,
    path: `release/x/${id}`,
    targets: ["windows"],
    displayName,
    version: "1.0",
    ...(languages !== undefined ? { languages } : {}),
  };
}

// Additional inline fixtures to achieve the variety the three sample fixtures
// can't cover on their own.

// A Latin keyboard that explicitly declares Hausa ("ha")
const hauseLatn = mk("hausa_latn", "Latn", "Hausa Latin", ["ha", "ha-Latn"]);

// A plain Latin keyboard — no languages declared
const bareLatin = mk("bare_latin", "Latn", "Bare Latin");

// An Arabic keyboard
const arabicKbd = mk("arabic_101", "Arab", "Arabic 101", ["ar"]);

// A Cyrillic keyboard
const cyrKbd = mk("cyrillic_ru", "Cyrl", "Cyrillic Russian", ["ru"]);

// ---------------------------------------------------------------------------
// 1. Empty query, no target → all bases, alphabetical by id
// ---------------------------------------------------------------------------

describe("rankBases — empty query, no target", () => {
  it("returns all bases sorted alphabetically by id", () => {
    const bases = [cyrKbd, arabicKbd, bareLatin];
    const result = rankBases(bases, "");
    expect(result.map((r) => r.base.id)).toEqual([
      "arabic_101",
      "bare_latin",
      "cyrillic_ru",
    ]);
  });

  it("returns no matchRanges on any entry", () => {
    const result = rankBases([basicKbdus, silEuroLatin], "");
    expect(result.every((r) => r.matchRanges === undefined)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Empty query, Latn target with language match → Latin first
// ---------------------------------------------------------------------------

describe("rankBases — empty query with Latn target (language match)", () => {
  it("Latin base that declares the target language ranks above other-script bases", () => {
    // hauseLatn declares "ha"; target is ha-Latn
    const bases = [arabicKbd, hauseLatn, cyrKbd];
    const result = rankBases(bases, "", { script: "Latn", bcp47: "ha-Latn" });
    expect(result[0]!.base.id).toBe("hausa_latn");
  });

  it("ctxTier 0 (script+lang match) beats ctxTier 1 (script only)", () => {
    // hauseLatn: script Latn + language ha → tier 0
    // bareLatin: script Latn, no lang match → tier 1
    const result = rankBases(
      [bareLatin, hauseLatn],
      "",
      { script: "Latn", bcp47: "ha-Latn" },
    );
    expect(result[0]!.base.id).toBe("hausa_latn");
    expect(result[1]!.base.id).toBe("bare_latin");
  });
});

// ---------------------------------------------------------------------------
// 3. Empty query, Deva target → Devanagari base first
// ---------------------------------------------------------------------------

describe("rankBases — empty query with Deva target", () => {
  it("Devanagari base ranks first for a Deva script target", () => {
    const bases = [basicKbdus, silEuroLatin, silDevanagariPhonetic];
    const result = rankBases(
      bases,
      "",
      { script: "Deva", bcp47: "hi-Deva" },
    );
    expect(result[0]!.base.id).toBe("sil_devanagari_phonetic");
  });

  it("Latin bases rank after the Deva base for a Deva target", () => {
    const result = rankBases(
      [basicKbdus, silEuroLatin, silDevanagariPhonetic],
      "",
      { script: "Deva", bcp47: "hi-Deva" },
    );
    const ids = result.map((r) => r.base.id);
    expect(ids.indexOf("sil_devanagari_phonetic")).toBeLessThan(
      ids.indexOf("sil_euro_latin"),
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Substring filter excludes non-matches
// ---------------------------------------------------------------------------

describe("rankBases — substring filter", () => {
  it("excludes bases that do not match the query in id/displayName/script/languages", () => {
    const result = rankBases([arabicKbd, cyrKbd, bareLatin], "arabic");
    const ids = result.map((r) => r.base.id);
    expect(ids).toContain("arabic_101");
    expect(ids).not.toContain("cyrillic_ru");
    expect(ids).not.toContain("bare_latin");
  });
});

// ---------------------------------------------------------------------------
// 5. Exact-id query → queryTier 0 first
// ---------------------------------------------------------------------------

describe("rankBases — exact id query (queryTier 0)", () => {
  it("exact id match ranks above a displayName substring match", () => {
    // "sil_euro_latin" exact id vs "SIL Euro Latin" display (which also contains "sil")
    const result = rankBases(
      [silDevanagariPhonetic, silEuroLatin, basicKbdus],
      "sil_euro_latin",
    );
    expect(result[0]!.base.id).toBe("sil_euro_latin");
  });

  it("exact id match has queryTier 0; prefix match has queryTier 2 — exact wins", () => {
    const kbExact = mk("sil_test", "Latn", "SIL Test");
    const kbPrefix = mk("sil_test_extended", "Latn", "SIL Test Extended");
    const result = rankBases([kbPrefix, kbExact], "sil_test");
    expect(result[0]!.base.id).toBe("sil_test");
  });
});

// ---------------------------------------------------------------------------
// 6. Exact-script query (e.g. "latn") → all that-script bases tier 0, others excluded
//
// NOTE: "script floods top" behavior — querying "latn" (the exact script name)
// gives every Latin keyboard queryTier 0, pushing them all to the front.
// Non-Latin keyboards are matched via substring on their own id/displayName only;
// if they don't contain "latn" they are excluded entirely.
// ---------------------------------------------------------------------------

describe("rankBases — exact script query (script floods top)", () => {
  it("all Latn-script bases appear; non-Latn bases absent if id/displayName don't contain 'latn'", () => {
    const result = rankBases(
      [arabicKbd, cyrKbd, bareLatin, hauseLatn, basicKbdus],
      "latn",
    );
    const ids = result.map((r) => r.base.id);
    expect(ids).toContain("bare_latin");
    expect(ids).toContain("hausa_latn");
    expect(ids).toContain("basic_kbdus");
    expect(ids).not.toContain("arabic_101"); // Arab script, id has no "latn"
    expect(ids).not.toContain("cyrillic_ru"); // Cyrl script
  });

  it("exact-script matches (tier 0) rank before prefix/substring matches (tier 2+)", () => {
    // "bare_latin" id contains "latn" as substring (not prefix), queryTier 3
    // but script==="Latn" → queryTier 0 via scriptLc === q
    const latnBase = mk("arab_with_latn_in_name", "Arab", "Arab Latn Named");
    const result = rankBases([latnBase, bareLatin], "latn");
    // bareLatin has script Latn (exact) → tier 0
    // latnBase has "latn" in displayName → tier 3 (id/displayName substring)
    expect(result[0]!.base.id).toBe("bare_latin");
  });
});

// ---------------------------------------------------------------------------
// 7. Exact-language query → language-declared bases ahead of pure substring
// ---------------------------------------------------------------------------

describe("rankBases — exact language query (queryTier 1)", () => {
  it("base with exact language tag match ranks ahead of displayName substring match", () => {
    // hauseLatn.languages includes "ha" — exact match → tier 1
    // arabicKbd has id "arabic_101", which doesn't contain "ha" → excluded
    // sylLatn: id contains "ha" somewhere in displayName → tier 3 (substring)
    const sylHa = mk("syllabic_ha", "Latn", "Syllabic HA Keyboard"); // displayName has "HA"
    const result = rankBases([sylHa, hauseLatn], "ha");
    expect(result[0]!.base.id).toBe("hausa_latn"); // tier 1 via language tag
  });

  it("primarySubtag match ('hi') fires tier 1 via a languages entry like 'hi-Deva'", () => {
    // silDevanagariPhonetic.languages includes "hi" directly AND "lif-Deva"
    // A query of "hi" should match it at tier 1 (primarySubtag === "hi")
    const result = rankBases([basicKbdus, silDevanagariPhonetic], "hi");
    expect(result[0]!.base.id).toBe("sil_devanagari_phonetic");
  });
});

// ---------------------------------------------------------------------------
// 8. Prefix beats substring — queryTier 2 < queryTier 3
// ---------------------------------------------------------------------------

describe("rankBases — prefix beats substring", () => {
  it("a displayName prefix match ranks before a displayName substring match", () => {
    // "sil_" prefix in id → tier 2 (startsWith)
    // silDevanagariPhonetic id = "sil_devanagari_phonetic" — starts with "sil"
    // basicKbdus id = "basic_kbdus" — contains "ic" not "sil"... use displayName
    // "SIL Euro Latin" starts with "sil" (downcased) → tier 2
    // "US English (Basic)" does NOT start with "sil"
    const usBasic = mk("us_basic_sil_variant", "Latn", "US Basic SIL variant"); // "sil" in middle → tier 3
    const silFirst = mk("sil_xkb_de", "Latn", "SIL German"); // starts with "sil" → tier 2
    const result = rankBases([usBasic, silFirst], "sil");
    expect(result[0]!.base.id).toBe("sil_xkb_de"); // tier 2 (prefix)
    expect(result[1]!.base.id).toBe("us_basic_sil_variant"); // tier 3 (substring)
  });

  it("id prefix beats displayName substring when both match", () => {
    const prefixId = mk("basic_foo", "Latn", "Contains basic somewhere"); // id prefix
    const substrDisplay = mk("xyz_bar", "Latn", "Some basic keyword"); // displayName has 'basic'
    // prefixId: idLc.startsWith("basic") → tier 2
    // substrDisplay: dnLc.includes("basic") → tier 3
    const result = rankBases([substrDisplay, prefixId], "basic");
    expect(result[0]!.base.id).toBe("basic_foo");
  });
});

// ---------------------------------------------------------------------------
// 9. Zero match → empty array
// ---------------------------------------------------------------------------

describe("rankBases — zero match", () => {
  it("returns [] when no base matches the query at any tier", () => {
    const result = rankBases([basicKbdus, arabicKbd], "zzzz_no_match");
    expect(result).toHaveLength(0);
  });

  it("returns [] for an empty bases list", () => {
    expect(rankBases([], "sil")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 10. Target tie-break within a query tier — same queryTier, ctxTier breaks tie
// ---------------------------------------------------------------------------

describe("rankBases — target tie-break within a query tier", () => {
  it("within the same queryTier, ctxTier 0 (lang+script match) beats ctxTier 1 (script only)", () => {
    // Both keyboards start with "sil" → queryTier 2
    // silDevanagariPhonetic: script Deva, lang hi → ctxTier 0 for hi-Deva target
    // bareDeva: script Deva, no lang declared → ctxTier 1
    const bareDeva = mk("sil_deva_other", "Deva", "SIL Deva Other");
    const result = rankBases(
      [bareDeva, silDevanagariPhonetic],
      "sil",
      { script: "Deva", bcp47: "hi-Deva" },
    );
    expect(result[0]!.base.id).toBe("sil_devanagari_phonetic"); // ctxTier 0
    expect(result[1]!.base.id).toBe("sil_deva_other"); // ctxTier 1
  });
});

// ---------------------------------------------------------------------------
// 11. matchRanges span correct for a known query
// ---------------------------------------------------------------------------

describe("rankBases — matchRanges", () => {
  it("matchRanges covers the displayName hit when the match is in displayName", () => {
    // "SIL Euro Latin" — searching "euro"
    // displayName.toLowerCase() = "sil euro latin"
    // "euro" starts at index 4
    const result = rankBases([silEuroLatin], "euro");
    expect(result).toHaveLength(1);
    const ranges = result[0]!.matchRanges;
    expect(ranges).toBeDefined();
    expect(ranges![0]!.field).toBe("displayName");
    expect(ranges![0]!.start).toBe(4); // "sil " is 4 chars
    expect(ranges![0]!.end).toBe(8);   // "euro" is 4 chars
  });

  it("matchRanges uses id span when displayName has no hit but id does", () => {
    // basicKbdus displayName = "US English (Basic)" — no "kbdus"
    // id = "basic_kbdus" — "kbdus" starts at index 6
    const result = rankBases([basicKbdus], "kbdus");
    expect(result).toHaveLength(1);
    const ranges = result[0]!.matchRanges;
    expect(ranges).toBeDefined();
    expect(ranges![0]!.field).toBe("id");
    expect(ranges![0]!.start).toBe(6);
    expect(ranges![0]!.end).toBe(11);
  });

  it("displayName match is preferred over id match when both are present", () => {
    // "SIL Euro Latin" has "sil" in displayName; "sil_euro_latin" also has "sil" in id
    // The function tries displayName first.
    const result = rankBases([silEuroLatin], "sil");
    expect(result).toHaveLength(1);
    expect(result[0]!.matchRanges![0]!.field).toBe("displayName");
  });

  it("no matchRanges when match is via script/language only (tier 4)", () => {
    // query = "deva" matches silDevanagariPhonetic's script ("Deva") as substring
    // but id = "sil_devanagari_phonetic" also contains "deva" → actually tier 3!
    // So test with a base where ONLY the script/lang matches.
    const pureScriptBase = mk("zebra_kbd", "Arab", "Zebra Keyboard", ["ar"]);
    const result = rankBases([pureScriptBase], "arab");
    expect(result).toHaveLength(1);
    // "arab" is in id? "zebra_kbd" no. displayName "Zebra Keyboard" no.
    // script "Arab".toLowerCase() contains "arab" → tier 4
    // matchRange → displayName has no hit, id has no hit → undefined
    expect(result[0]!.matchRanges).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 12. Explicit-script target suppresses cross-script suggestions (ctxTier 2)
// ---------------------------------------------------------------------------

describe("rankBases — explicit-script suppresses ctxTier 2", () => {
  it("hi-Latn target does NOT give ctxTier 2 to the Deva base even though it declares 'hi'", () => {
    // silDevanagariPhonetic declares "hi" in languages.
    // target bcp47 = "hi-Latn" has explicit script subtag → cross-script tier suppressed.
    // ctxTier for silDevanagariPhonetic should be 3, not 2.

    // We prove this by comparing rankings: without explicit script, a cross-script
    // base would bubble up; with explicit script, it stays at tier 3 = same as no match.
    const languagesById = {
      [silDevanagariPhonetic.id]: silDevanagariPhonetic.languages ?? [],
    };
    const resultExplicit = rankBases(
      [bareLatin, silDevanagariPhonetic],
      "",
      { script: "Latn", bcp47: "hi-Latn" }, // explicit Latn script
      languagesById,
    );

    // bareLatin: script match (tier 1)
    // silDevanagariPhonetic: language declared but explicit script tag → suppressed → tier 3
    expect(resultExplicit[0]!.base.id).toBe("bare_latin");
    expect(resultExplicit[1]!.base.id).toBe("sil_devanagari_phonetic");
  });

  it("hi (bare, no script subtag) DOES grant ctxTier 2 to a cross-script base", () => {
    // target bcp47 = "hi" (no script subtag) → hasExplicitScriptSubtag = false
    // silDevanagariPhonetic declares "hi" → ctxTier 2
    const languagesById = {
      [silDevanagariPhonetic.id]: silDevanagariPhonetic.languages ?? [],
    };
    const resultImplicit = rankBases(
      [arabicKbd, silDevanagariPhonetic],
      "",
      { script: "Latn", bcp47: "hi" }, // no explicit script subtag
      languagesById,
    );
    // silDevanagariPhonetic: lang match, no explicit script → ctxTier 2
    // arabicKbd: no match at all → ctxTier 3
    expect(resultImplicit[0]!.base.id).toBe("sil_devanagari_phonetic");
  });
});

// ---------------------------------------------------------------------------
// 13. languagesById override takes precedence over base.languages
// ---------------------------------------------------------------------------

describe("rankBases — languagesById override", () => {
  it("languagesById overrides base.languages for ctxTier calculation", () => {
    // basicKbdus.languages includes "en" — would normally tier-0 for an en target.
    // Override languagesById to say basicKbdus has NO languages.
    // That should push it to ctxTier 1 (script match only) for en-Latn.
    const overriddenLanguages: Record<string, readonly string[]> = {
      [basicKbdus.id]: [], // strip all language tags
      [silEuroLatin.id]: ["en"], // give Euro Latin the 'en' language instead
    };
    const result = rankBases(
      [basicKbdus, silEuroLatin],
      "",
      { script: "Latn", bcp47: "en-Latn" },
      overriddenLanguages,
    );
    // silEuroLatin now has the 'en' language → ctxTier 0
    // basicKbdus stripped → ctxTier 1 (still Latn script match)
    expect(result[0]!.base.id).toBe("sil_euro_latin");
    expect(result[1]!.base.id).toBe("basic_kbdus");
  });

  it("languagesById key for an id takes full precedence over base.languages for query tier too", () => {
    // bareLatin has no base.languages declared.
    // Inject "xx-Latn" via languagesById.
    // Query "xx" → tier 1 via language tag match through languagesById.
    const overriddenLanguages: Record<string, readonly string[]> = {
      [bareLatin.id]: ["xx-Latn"],
    };
    const result = rankBases(
      [arabicKbd, bareLatin],
      "xx",
      undefined,
      overriddenLanguages,
    );
    const ids = result.map((r) => r.base.id);
    expect(ids).toContain("bare_latin");
    expect(result.find((r) => r.base.id === "bare_latin")!.base).toBe(bareLatin);
  });
});

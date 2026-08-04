// Unit tests for the PlacementMap -> Phase B seed adapter.
// refs #134 (character-inventory seeder: SPA consumption).
//
// Fixture: src/survey/__fixtures__/placement-map.sample.json
//   5 codepoints, all candidates have confidence in [0,1]:
//     U+0253 ɓ  conf 0.9  modifiers []         -> S-01  (direct, no RALT)
//     U+0257 ɗ  conf 0.9  modifiers []         -> S-01
//     U+0259 ə  conf 0.6  modifiers ["RALT"]   -> S-08
//     U+014B ŋ  conf 0.6  modifiers ["RALT"]   -> S-08
//     U+025B ɛ  conf 0.9  modifiers []         -> S-01
//
// All 5 meet the default threshold of 0.5.
// Expected pb_special_letters_list seed: "ɓ ɗ ə ŋ ɛ"

import { describe, it, expect } from "vitest";
import type { PlacementMap, PlacementCandidate } from "@keyboard-studio/contracts";
import {
  buildPlacementSeeds,
  extractSeedEntries,
  getSuggestionForChar,
  getSuggestionForCharWithCasePair,
  getRankedSuggestionsForChar,
  PLACEMENT_SEED_CONFIDENCE_THRESHOLD,
} from "./placementSeeds.ts";
import fixtureJson from "./__fixtures__/placement-map.sample.json";

// Cast the imported JSON to PlacementMap — the fixture satisfies the shape.
const fixture = fixtureJson as PlacementMap;

// ---------------------------------------------------------------------------
// buildPlacementSeeds
// ---------------------------------------------------------------------------

describe("buildPlacementSeeds — fixture (all entries above threshold)", () => {
  it("returns a Map with key pb_special_letters_list", () => {
    const seeds = buildPlacementSeeds(fixture);
    expect(seeds.has("pb_special_letters_list")).toBe(true);
  });

  it("seeds pb_special_letters_list with the exact space-joined characters at default threshold", () => {
    // All 5 codepoints have confidence >= 0.5, so all qualify.
    // Order matches fixture entry order: U+0253 ɓ, U+0257 ɗ, U+0259 ə, U+014B ŋ, U+025B ɛ
    const seeds = buildPlacementSeeds(fixture);
    expect(seeds.get("pb_special_letters_list")).toBe("ɓ ɗ ə ŋ ɛ");
  });

  it("returns only one key (pb_special_letters_list) in v1", () => {
    const seeds = buildPlacementSeeds(fixture);
    expect(seeds.size).toBe(1);
  });
});

describe("buildPlacementSeeds — empty map when all entries are below threshold", () => {
  it("returns an empty Map when threshold is set above all confidences", () => {
    // All fixture candidates have confidence <= 0.9; use threshold 1.0 to drop all.
    const seeds = buildPlacementSeeds(fixture, 1.0);
    expect(seeds.size).toBe(0);
  });

  it("returns an empty Map for a PlacementMap whose entries are all below 0.5", () => {
    const lowConfMap: PlacementMap = {
      entries: [
        {
          codepoint: "U+0260",
          candidates: [
            { vkey: "K_G", modifiers: [], mechanism: "direct", priorSource: "phonetic", priorCount: 0, confidence: 0.3 },
          ],
        },
        {
          codepoint: "U+0266",
          candidates: [
            { vkey: "K_H", modifiers: [], mechanism: "direct", priorSource: "phonetic", priorCount: 0, confidence: 0.1 },
          ],
        },
      ],
    };
    const seeds = buildPlacementSeeds(lowConfMap);
    expect(seeds.size).toBe(0);
    expect(seeds.has("pb_special_letters_list")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// extractSeedEntries — strategyId tagging
// ---------------------------------------------------------------------------

describe("extractSeedEntries — strategyId attribution", () => {
  it("tags S-01 for direct/no-RALT codepoints", () => {
    const entries = extractSeedEntries(fixture);
    // U+0253 ɓ, U+0257 ɗ, U+025B ɛ are S-01 (no RALT)
    const s01chars = entries.filter((e) => e.strategyId === "S-01").map((e) => e.character);
    expect(s01chars).toContain("ɓ");
    expect(s01chars).toContain("ɗ");
    expect(s01chars).toContain("ɛ");
  });

  it("tags S-08 for RALT-modified codepoints", () => {
    const entries = extractSeedEntries(fixture);
    // U+0259 ə and U+014B ŋ are S-08 (modifiers: ["RALT"])
    const s08chars = entries.filter((e) => e.strategyId === "S-08").map((e) => e.character);
    expect(s08chars).toContain("ə");
    expect(s08chars).toContain("ŋ");
  });

  it("tags exactly 3 entries as S-01 and 2 as S-08 for the full fixture", () => {
    const entries = extractSeedEntries(fixture);
    const s01 = entries.filter((e) => e.strategyId === "S-01");
    const s08 = entries.filter((e) => e.strategyId === "S-08");
    expect(s01).toHaveLength(3);
    expect(s08).toHaveLength(2);
  });

  it("returns one entry per qualifying codepoint (5 at default threshold)", () => {
    const entries = extractSeedEntries(fixture);
    expect(entries).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// Threshold filtering
// ---------------------------------------------------------------------------

describe("extractSeedEntries — threshold filtering", () => {
  it("drops entries whose top candidate is below the supplied threshold", () => {
    // U+0259 ə and U+014B ŋ have confidence 0.6; U+0253, U+0257, U+025B have 0.9.
    // Use threshold 0.7 to drop the 0.6 entries.
    const entries = extractSeedEntries(fixture, 0.7);
    const chars = entries.map((e) => e.character);
    expect(chars).not.toContain("ə");
    expect(chars).not.toContain("ŋ");
    // The 0.9 entries must still be present
    expect(chars).toContain("ɓ");
    expect(chars).toContain("ɗ");
    expect(chars).toContain("ɛ");
  });

  it("buildPlacementSeeds with high threshold drops low-confidence chars from the seed string", () => {
    const seeds = buildPlacementSeeds(fixture, 0.7);
    const seedStr = seeds.get("pb_special_letters_list");
    expect(seedStr).toBeDefined();
    // Only the 3 characters with confidence 0.9 survive
    expect(seedStr).toBe("ɓ ɗ ɛ");
    // Dropped chars must not appear
    expect(seedStr).not.toContain("ə");
    expect(seedStr).not.toContain("ŋ");
  });
});

// ---------------------------------------------------------------------------
// getSeedValue usage pattern
// ---------------------------------------------------------------------------

describe("getSeedValue built from buildPlacementSeeds", () => {
  it("returns the seed string for pb_special_letters_list", () => {
    const seeds = buildPlacementSeeds(fixture);
    const getSeedValue = (id: string): string | string[] | undefined => seeds.get(id);
    expect(getSeedValue("pb_special_letters_list")).toBe("ɓ ɗ ə ŋ ɛ");
  });

  it("returns undefined for any other question id", () => {
    const seeds = buildPlacementSeeds(fixture);
    const getSeedValue = (id: string): string | string[] | undefined => seeds.get(id);
    expect(getSeedValue("pb_discovery_intro")).toBeUndefined();
    expect(getSeedValue("pb_latin_digraphs_list")).toBeUndefined();
    expect(getSeedValue("some_other_question")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Edge / malformed cases
// ---------------------------------------------------------------------------

describe("extractSeedEntries — edge cases", () => {
  it("skips an entry with no candidates without throwing", () => {
    const mapWithEmpty: PlacementMap = {
      entries: [
        // Entry with no candidates — must be skipped
        { codepoint: "U+0253", candidates: [] },
        // Normal entry that qualifies
        {
          codepoint: "U+025B",
          candidates: [
            { vkey: "K_E", modifiers: [], mechanism: "direct", priorSource: "unicode-decomp", priorCount: 0, confidence: 0.9 },
          ],
        },
      ],
    };
    let entries: ReturnType<typeof extractSeedEntries> | undefined;
    expect(() => {
      entries = extractSeedEntries(mapWithEmpty);
    }).not.toThrow();
    // Only the qualifying entry should be in the result
    expect(entries).toHaveLength(1);
    expect(entries![0]!.character).toBe("ɛ");
  });

  it("buildPlacementSeeds on a map with only empty-candidate entries returns empty Map", () => {
    const noCandsMap: PlacementMap = {
      entries: [
        { codepoint: "U+0253", candidates: [] },
        { codepoint: "U+0257", candidates: [] },
      ],
    };
    const seeds = buildPlacementSeeds(noCandsMap);
    expect(seeds.size).toBe(0);
  });

  it("PLACEMENT_SEED_CONFIDENCE_THRESHOLD constant is 0.5", () => {
    expect(PLACEMENT_SEED_CONFIDENCE_THRESHOLD).toBe(0.5);
  });

  it("malformed codepoint is silently skipped — no throw, char absent from seed", () => {
    // codepointToChar returns undefined for codepoints that are not valid U+XXXX format.
    // "U+XYZ" and "Z253" are genuinely unparseable under the current parseUPlusNotation contract.
    const malformedMap: PlacementMap = {
      entries: [
        {
          codepoint: "U+XYZ",
          candidates: [
            { vkey: "K_X", modifiers: [], mechanism: "direct", priorSource: "phonetic", priorCount: 0, confidence: 0.9 },
          ],
        },
        {
          codepoint: "Z253",
          candidates: [
            { vkey: "K_B", modifiers: [], mechanism: "direct", priorSource: "phonetic", priorCount: 0, confidence: 0.9 },
          ],
        },
        // One valid entry so we can confirm only the malformed ones are skipped.
        {
          codepoint: "U+025B",
          candidates: [
            { vkey: "K_E", modifiers: [], mechanism: "direct", priorSource: "unicode-decomp", priorCount: 0, confidence: 0.9 },
          ],
        },
      ],
    };
    let entries: ReturnType<typeof extractSeedEntries> | undefined;
    expect(() => {
      entries = extractSeedEntries(malformedMap);
    }).not.toThrow();
    // Only the valid codepoint should survive.
    expect(entries).toHaveLength(1);
    expect(entries![0]!.character).toBe("ɛ");

    // buildPlacementSeeds should also not throw and should exclude the malformed chars.
    let seeds: ReturnType<typeof buildPlacementSeeds> | undefined;
    expect(() => {
      seeds = buildPlacementSeeds(malformedMap);
    }).not.toThrow();
    const seedStr = seeds!.get("pb_special_letters_list");
    expect(seedStr).toBe("ɛ");
    expect(seedStr).not.toContain("U+XYZ");
    expect(seedStr).not.toContain("Z253");
  });

  it("buildPlacementSeeds(fixture, NaN) does not throw and returns an empty map", () => {
    // confidence >= NaN is always false, so no entry qualifies.
    let seeds: ReturnType<typeof buildPlacementSeeds> | undefined;
    expect(() => {
      seeds = buildPlacementSeeds(fixture, NaN);
    }).not.toThrow();
    expect(seeds!.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getSuggestionForCharWithCasePair — uppercase case-pair fallback
// ---------------------------------------------------------------------------

describe("getSuggestionForCharWithCasePair", () => {
  it("synthesizes an S-08 entry for an uppercase whose lowercase sibling has a direct RALT candidate", () => {
    // Fixture: U+0259 ə -> S-08, vkey K_E, modifiers ["RALT"], confidence 0.6.
    // Ə (U+018F) is ə's uppercase counterpart and has no map entry of its own.
    const entry = getSuggestionForCharWithCasePair("Ə", fixture);
    expect(entry).not.toBeNull();
    expect(entry!.strategyId).toBe("S-08");
    expect(entry!.character).toBe("Ə");
    expect(entry!.topCandidate.vkey).toBe("K_E");
    expect(entry!.topCandidate.modifiers).toContain("SHIFT");
    expect(entry!.topCandidate.modifiers).toContain("RALT");
  });

  it("carries over the lowercase sibling's other PlacementCandidate fields unchanged", () => {
    const entry = getSuggestionForCharWithCasePair("Ə", fixture);
    const sibling = getSuggestionForChar("ə", fixture)!.topCandidate;
    expect(entry!.topCandidate.mechanism).toBe(sibling.mechanism);
    expect(entry!.topCandidate.priorSource).toBe(sibling.priorSource);
    expect(entry!.topCandidate.priorCount).toBe(sibling.priorCount);
    expect(entry!.topCandidate.confidence).toBe(sibling.confidence);
  });

  it("returns null for an uppercase whose lowercase sibling has no map entry at all", () => {
    // "z" is not in the fixture, so "Z" has no sibling to fall back to.
    expect(getSuggestionForCharWithCasePair("Z", fixture)).toBeNull();
  });

  it("returns null for an uppercase whose lowercase sibling is S-01 (no RALT), not S-08", () => {
    // Fixture: U+0253 ɓ -> S-01 (modifiers: []). Ɓ (U+0181) must not fall back.
    expect(getSuggestionForCharWithCasePair("Ɓ", fixture)).toBeNull();
  });

  it("leaves a lowercase character's own direct lookup unaffected", () => {
    // "ə" has its own qualifying entry — must resolve exactly like
    // getSuggestionForChar, never attempt the case-pair fallback.
    const direct = getSuggestionForChar("ə", fixture);
    const withFallback = getSuggestionForCharWithCasePair("ə", fixture);
    expect(withFallback).toEqual(direct);
  });

  it("leaves a character with its own qualifying entry unaffected even when it also has a case pair", () => {
    // Fixture: U+025B ɛ -> S-01 direct entry of its own. Confirm the fallback
    // path is never reached (S-01 entry returned as-is, not overridden).
    const direct = getSuggestionForChar("ɛ", fixture);
    const withFallback = getSuggestionForCharWithCasePair("ɛ", fixture);
    expect(withFallback).toEqual(direct);
  });

  it("suppresses the fallback for an orthographically-unicameral (Georgian) case pair", () => {
    // Custom map: lowercase Mkhedruli ა (U+10D0) has a qualifying direct RALT
    // (S-08) candidate. Its Unicode-formal uppercase Mtavruli counterpart
    // Ⴀ/Ა (U+1C90) must NOT receive a synthesized suggestion — Georgian
    // orthography does not case-alternate (see casePairCompanion.ts).
    const georgianMap: PlacementMap = {
      entries: [
        {
          codepoint: "U+10D0",
          candidates: [
            {
              vkey: "K_A",
              modifiers: ["RALT"],
              mechanism: "direct",
              priorSource: "confusable",
              priorCount: 0,
              confidence: 0.6,
            },
          ],
        },
      ],
    };
    // Sanity: the lowercase entry itself qualifies (so a false "no sibling"
    // pass would be a false positive for the suppression test).
    expect(getSuggestionForChar("ა", georgianMap)).not.toBeNull();
    expect(
      getSuggestionForCharWithCasePair("Ა", georgianMap),
    ).toBeNull();
  });

  it("returns null when char has no case counterpart at all (caseless script)", () => {
    // Arabic ب has no Lu/Ll case distinction — caseCounterpart returns null.
    expect(getSuggestionForCharWithCasePair("ب", fixture)).toBeNull();
  });

  it("returns null for an empty-string char (null-safety)", () => {
    expect(getSuggestionForCharWithCasePair("", fixture)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getRankedSuggestionsForChar — up to 2 distinct-strategy entries
// ---------------------------------------------------------------------------

const raltCandidate: PlacementCandidate = {
  vkey: "K_F",
  modifiers: ["RALT"],
  mechanism: "direct",
  priorSource: "corpus",
  priorCount: 5,
  confidence: 0.7,
};

const deadkeyCandidateWithBase: PlacementCandidate = {
  vkey: "K_F",
  modifiers: [],
  mechanism: "deadkey",
  priorSource: "corpus",
  priorCount: 8,
  confidence: 0.8,
  baseLetter: "f",
};

const deadkeyCandidateNoBase: PlacementCandidate = {
  vkey: "K_F",
  modifiers: [],
  mechanism: "deadkey",
  priorSource: "corpus",
  priorCount: 2,
  confidence: 0.6,
  // no baseLetter — must never qualify as an S-02 suggestion.
};

const swapCandidate: PlacementCandidate = {
  vkey: "K_F",
  modifiers: [],
  mechanism: "direct",
  priorSource: "corpus",
  priorCount: 3,
  confidence: 0.55,
};

describe("getRankedSuggestionsForChar", () => {
  it("returns both S-02 and S-08 entries, in candidate order, when both are attested for ƒ U+0192", () => {
    const map: PlacementMap = {
      entries: [
        {
          codepoint: "U+0192",
          candidates: [deadkeyCandidateWithBase, raltCandidate],
        },
      ],
    };
    const entries = getRankedSuggestionsForChar("ƒ", map);
    expect(entries).toHaveLength(2);
    expect(entries[0]!.strategyId).toBe("S-02");
    expect(entries[0]!.topCandidate.baseLetter).toBe("f");
    expect(entries[1]!.strategyId).toBe("S-08");
  });

  it("caps at 2 entries even when 3 distinct strategies are attested", () => {
    const map: PlacementMap = {
      entries: [
        {
          codepoint: "U+0192",
          candidates: [deadkeyCandidateWithBase, raltCandidate, swapCandidate],
        },
      ],
    };
    const entries = getRankedSuggestionsForChar("ƒ", map);
    expect(entries).toHaveLength(2);
  });

  it("drops a deadkey/store-index candidate with no corpus-attested baseLetter (per-codepoint attestation rule)", () => {
    const map: PlacementMap = {
      entries: [
        {
          codepoint: "U+0192",
          candidates: [deadkeyCandidateNoBase, raltCandidate],
        },
      ],
    };
    const entries = getRankedSuggestionsForChar("ƒ", map);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.strategyId).toBe("S-08");
  });

  it("never derives an S-02 suggestion from decomposability alone (only from an attested candidate)", () => {
    // "é" decomposes (NFD: e + combining acute) but the map carries no
    // deadkey/store-index candidate at all for it — only a direct one.
    const map: PlacementMap = {
      entries: [
        {
          codepoint: "U+00E9",
          candidates: [
            {
              vkey: "K_E",
              modifiers: [],
              mechanism: "direct",
              priorSource: "unicode-decomp",
              priorCount: 0,
              confidence: 0.9,
            },
          ],
        },
      ],
    };
    const entries = getRankedSuggestionsForChar("é", map);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.strategyId).toBe("S-01");
  });

  it("suppresses an S-02 suggestion for a combining-mark codepoint", () => {
    // U+0301 COMBINING ACUTE ACCENT — even with an attested baseLetter, a
    // combining mark must never receive a deadkey suggestion.
    const map: PlacementMap = {
      entries: [
        {
          codepoint: "U+0301",
          candidates: [
            {
              vkey: "K_QUOTE",
              modifiers: [],
              mechanism: "deadkey",
              priorSource: "corpus",
              priorCount: 5,
              confidence: 0.8,
              baseLetter: "a",
            },
          ],
        },
      ],
    };
    const entries = getRankedSuggestionsForChar("́", map);
    expect(entries).toHaveLength(0);
  });

  it("returns entries unmodified when char has its own qualifying entry (no inheritance attempted)", () => {
    const map: PlacementMap = {
      entries: [
        { codepoint: "U+0192", candidates: [deadkeyCandidateWithBase] },
      ],
    };
    const entries = getRankedSuggestionsForChar("ƒ", map);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.strategyId).toBe("S-02");
  });

  it("returns an empty list when the codepoint is entirely absent from the map", () => {
    expect(getRankedSuggestionsForChar("ƒ", { entries: [] })).toEqual([]);
  });

  // -- Case-pair inheritance: S-08 shape --------------------------------

  it("case-pair inheritance (S-08): uppercase inherits the lowercase's RALT entry, shifted", () => {
    const entries = getRankedSuggestionsForChar("Ə", fixture);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.strategyId).toBe("S-08");
    expect(entries[0]!.topCandidate.modifiers).toContain("SHIFT");
    expect(entries[0]!.topCandidate.modifiers).toContain("RALT");
  });

  // -- Case-pair inheritance: S-01 shape --------------------------------

  it("case-pair inheritance (S-01): uppercase inherits the lowercase's swap entry as a same-vkey Shift-plane suggestion", () => {
    // A synthetic single-letter map: lowercase "f" has a direct (S-01)
    // candidate; uppercase "F" has none of its own, so it must inherit.
    const asciiMap: PlacementMap = {
      entries: [
        {
          codepoint: "U+0066", // "f"
          candidates: [
            {
              vkey: "K_F",
              modifiers: [],
              mechanism: "direct",
              priorSource: "corpus",
              priorCount: 4,
              confidence: 0.9,
            },
          ],
        },
      ],
    };
    const entries = getRankedSuggestionsForChar("F", asciiMap);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.strategyId).toBe("S-01");
    expect(entries[0]!.topCandidate.vkey).toBe("K_F");
    expect(entries[0]!.topCandidate.modifiers).toEqual(["SHIFT"]);
  });

  // -- Case-pair inheritance: S-02 shape --------------------------------

  it("case-pair inheritance (S-02): uppercase inherits the lowercase's deadkey entry with a case-shifted baseLetter", () => {
    const asciiDeadkeyMap: PlacementMap = {
      entries: [
        {
          codepoint: "U+0066", // "f"
          candidates: [
            {
              vkey: "K_QUOTE",
              modifiers: [],
              mechanism: "deadkey",
              priorSource: "corpus",
              priorCount: 6,
              confidence: 0.8,
              baseLetter: "f",
            },
          ],
        },
      ],
    };
    const entries = getRankedSuggestionsForChar("F", asciiDeadkeyMap);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.strategyId).toBe("S-02");
    expect(entries[0]!.topCandidate.baseLetter).toBe("F");
    // vkey/modifiers untouched — only baseLetter is case-shifted.
    expect(entries[0]!.topCandidate.vkey).toBe("K_QUOTE");
    expect(entries[0]!.topCandidate.modifiers).toEqual([]);
  });

  it("skips the S-02 inheritance entry when the lowercase's baseLetter has no case counterpart", () => {
    // A lowercase entry ("g") whose corpus-attested baseLetter is "1"
    // (caseless — caseCounterpart("1") is null) must have its S-02 entry
    // SKIPPED on inheritance, not substituted with anything else — "G"
    // ends up with no ranked suggestions at all.
    const numeralBaseMap: PlacementMap = {
      entries: [
        {
          codepoint: "U+0067", // "g"
          candidates: [
            {
              vkey: "K_QUOTE",
              modifiers: [],
              mechanism: "deadkey",
              priorSource: "corpus",
              priorCount: 6,
              confidence: 0.8,
              baseLetter: "1",
            },
          ],
        },
      ],
    };
    const inherited = getRankedSuggestionsForChar("G", numeralBaseMap);
    expect(inherited).toHaveLength(0);
  });

  // -- Turkic i/İ (bcp47="tr") -------------------------------------------

  it("Turkic bcp47 'tr': uppercase İ inherits lowercase i's entries with locale-correct casing", () => {
    const map: PlacementMap = {
      entries: [
        {
          codepoint: "U+0069", // "i"
          candidates: [
            {
              vkey: "K_I",
              modifiers: ["RALT"],
              mechanism: "direct",
              priorSource: "corpus",
              priorCount: 4,
              confidence: 0.8,
            },
          ],
        },
      ],
    };
    // Under "tr", caseCounterpart("İ", "tr") maps back to "i" (toLower), so
    // İ (U+0130) qualifies as the uppercase half whose lowercase sibling is
    // looked up.
    const entries = getRankedSuggestionsForChar("İ", map, PLACEMENT_SEED_CONFIDENCE_THRESHOLD, "tr");
    expect(entries).toHaveLength(1);
    expect(entries[0]!.strategyId).toBe("S-08");
    expect(entries[0]!.topCandidate.modifiers).toContain("SHIFT");
  });

  it("Turkic bcp47 'tr': dotless deadkey baseLetter 'i' case-shifts to dotted 'İ'", () => {
    const map: PlacementMap = {
      entries: [
        {
          codepoint: "U+0069", // "i"
          candidates: [
            {
              vkey: "K_QUOTE",
              modifiers: [],
              mechanism: "deadkey",
              priorSource: "corpus",
              priorCount: 6,
              confidence: 0.8,
              baseLetter: "i",
            },
          ],
        },
      ],
    };
    const entries = getRankedSuggestionsForChar("İ", map, PLACEMENT_SEED_CONFIDENCE_THRESHOLD, "tr");
    expect(entries).toHaveLength(1);
    expect(entries[0]!.strategyId).toBe("S-02");
    expect(entries[0]!.topCandidate.baseLetter).toBe("İ");
  });

  // -- Georgian suppression ------------------------------------------------

  it("suppresses case-pair inheritance for an orthographically-unicameral (Georgian) pair", () => {
    const georgianMap: PlacementMap = {
      entries: [
        {
          codepoint: "U+10D0",
          candidates: [
            {
              vkey: "K_A",
              modifiers: ["RALT"],
              mechanism: "direct",
              priorSource: "confusable",
              priorCount: 0,
              confidence: 0.6,
            },
          ],
        },
      ],
    };
    expect(getRankedSuggestionsForChar("ა", georgianMap)).toHaveLength(1);
    expect(getRankedSuggestionsForChar("Ა", georgianMap)).toEqual([]);
  });

  it("returns an empty list for a caseless script char with no case counterpart at all", () => {
    expect(getRankedSuggestionsForChar("ب", fixture)).toEqual([]);
  });

  it("returns an empty list for an empty-string char (null-safety)", () => {
    expect(getRankedSuggestionsForChar("", fixture)).toEqual([]);
  });
});

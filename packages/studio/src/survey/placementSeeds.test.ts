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
import type { PlacementMap } from "@keyboard-studio/contracts";
import { buildPlacementSeeds, extractSeedEntries, PLACEMENT_SEED_CONFIDENCE_THRESHOLD } from "./placementSeeds.ts";
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

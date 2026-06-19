/**
 * West-African Latin hooked/implosive letter spot-check fixtures.
 *
 * These 10 codepoints are well-known convergent placements across West-African
 * Unicode keyboards on the RALT layer.  Each fixture is a minimal synthetic
 * .kmn source; we parse it, call emitPlacementMap, and assert the codepoint
 * appears with the expected vkey + RALT modifier.
 *
 * @see spec.md §7.6 (corpus-derived placement priors)
 */

import { describe, it, expect } from "vitest";
import { emitPlacementMap } from "./index.js";
import { parse } from "../codec/parse.js";
import type { PlacementCandidate } from "@keyboard-studio/contracts";

/** Flatten the codepoint-keyed Map returned by emitPlacementMap into a plain array. */
function flatCandidates(ir: Parameters<typeof emitPlacementMap>[0]): PlacementCandidate[] {
  return [...emitPlacementMap(ir).values()].flat();
}

// ---------------------------------------------------------------------------
// Fixture builder
// ---------------------------------------------------------------------------

/**
 * Build a minimal Unicode keyboard with a single RALT-layer rule.
 * The hexCp parameter is the uppercase 4-char hex codepoint (e.g. "0253").
 */
function raltKmn(vkey: string, hexCp: string): string {
  return [
    "store(&VERSION) '10.0'",
    "store(&TARGETS) 'any'",
    "begin Unicode > use(main)",
    "group(main) using keys",
    `+ [RALT ${vkey}] > U+${hexCp}`,
  ].join("\n");
}

/**
 * Parse the KMN, run emitPlacementMap, and return the candidate for the
 * given vkey (with RALT modifier).
 */
function extractRaltCandidate(
  vkey: string,
  hexCp: string,
  kbId: string,
): PlacementCandidate | undefined {
  const { ir } = parse(raltKmn(vkey, hexCp), kbId);
  return flatCandidates(ir).find(
    (c) => c.vkey === vkey && c.modifiers.includes("RALT"),
  );
}

// ---------------------------------------------------------------------------
// West-African fixture table
// ---------------------------------------------------------------------------

interface WestAfricanFixture {
  description: string;
  codepoint: number;
  /** 4-char uppercase hex used in U+XXXX KMN notation. */
  hexCp: string;
  vkey: string;
  modifiers: string[];
}

const WEST_AFRICAN_FIXTURES: WestAfricanFixture[] = [
  {
    description: "U+0253 ɓ LATIN SMALL LETTER B WITH HOOK",
    codepoint: 0x0253,
    hexCp: "0253",
    vkey: "K_B",
    modifiers: ["RALT"],
  },
  {
    description: "U+0257 ɗ LATIN SMALL LETTER D WITH HOOK",
    codepoint: 0x0257,
    hexCp: "0257",
    vkey: "K_D",
    modifiers: ["RALT"],
  },
  {
    description: "U+0260 ɠ LATIN SMALL LETTER G WITH HOOK",
    codepoint: 0x0260,
    hexCp: "0260",
    vkey: "K_G",
    modifiers: ["RALT"],
  },
  {
    description: "U+014B ŋ LATIN SMALL LETTER ENG",
    codepoint: 0x014b,
    hexCp: "014B",
    vkey: "K_N",
    modifiers: ["RALT"],
  },
  {
    description: "U+025B ɛ LATIN SMALL LETTER OPEN E",
    codepoint: 0x025b,
    hexCp: "025B",
    vkey: "K_E",
    modifiers: ["RALT"],
  },
  {
    description: "U+0254 ɔ LATIN SMALL LETTER OPEN O",
    codepoint: 0x0254,
    hexCp: "0254",
    vkey: "K_O",
    modifiers: ["RALT"],
  },
  {
    description: "U+0272 ɲ LATIN SMALL LETTER N WITH LEFT HOOK",
    codepoint: 0x0272,
    hexCp: "0272",
    vkey: "K_HYPHEN",
    modifiers: ["RALT"],
  },
  {
    description: "U+028B ʋ LATIN SMALL LETTER V WITH HOOK",
    codepoint: 0x028b,
    hexCp: "028B",
    vkey: "K_V",
    modifiers: ["RALT"],
  },
  {
    description: "U+0283 ʃ LATIN SMALL LETTER ESH",
    codepoint: 0x0283,
    hexCp: "0283",
    vkey: "K_S",
    modifiers: ["RALT"],
  },
  {
    description: "U+0292 ʒ LATIN SMALL LETTER EZH",
    codepoint: 0x0292,
    hexCp: "0292",
    vkey: "K_Z",
    modifiers: ["RALT"],
  },
];

// ---------------------------------------------------------------------------
// Parameterised spot-check suite
// ---------------------------------------------------------------------------

describe("West-African Latin placement spot-check fixtures", () => {
  it.each(WEST_AFRICAN_FIXTURES)(
    "$description — emitPlacementMap extracts $vkey+RALT for U+$hexCp",
    ({ codepoint, hexCp, vkey, modifiers }) => {
      const { ir } = parse(raltKmn(vkey, hexCp), `kb-wa-${codepoint.toString(16)}`);
      const candidates = flatCandidates(ir);

      expect(
        candidates.length,
        `emitPlacementMap returned no candidates for U+${hexCp}`,
      ).toBeGreaterThanOrEqual(1);

      const match = candidates.find(
        (c) => c.vkey === vkey && c.modifiers.includes("RALT"),
      );

      expect(
        match,
        `No candidate with vkey=${vkey} + RALT found for U+${hexCp}. ` +
          `Got: ${JSON.stringify(candidates)}`,
      ).toBeDefined();

      // Confirm each expected modifier is present.
      for (const m of modifiers) {
        expect(match?.modifiers).toContain(m);
      }
    },
  );

  it("all 10 West-African fixtures produce exactly one RALT candidate each (no duplicates)", () => {
    for (const fixture of WEST_AFRICAN_FIXTURES) {
      const { ir } = parse(
        raltKmn(fixture.vkey, fixture.hexCp),
        `kb-wa-dedup-${fixture.codepoint.toString(16)}`,
      );
      const candidates = flatCandidates(ir);
      const raltMatches = candidates.filter(
        (c) => c.vkey === fixture.vkey && c.modifiers.includes("RALT"),
      );
      expect(
        raltMatches,
        `Expected exactly 1 RALT candidate for ${fixture.description}, got ${raltMatches.length}`,
      ).toHaveLength(1);
    }
  });

  it("all 10 fixtures produce mechanism='direct' and priorSource='corpus'", () => {
    for (const fixture of WEST_AFRICAN_FIXTURES) {
      const { ir } = parse(
        raltKmn(fixture.vkey, fixture.hexCp),
        `kb-wa-fields-${fixture.codepoint.toString(16)}`,
      );
      const candidates = flatCandidates(ir);
      const c = candidates.find(
        (cand) => cand.vkey === fixture.vkey && cand.modifiers.includes("RALT"),
      );
      expect(c?.mechanism).toBe("direct");
      expect(c?.priorSource).toBe("corpus");
    }
  });

  it("spot-check ɲ (U+0272) on K_HYPHEN: extractRaltCandidate helper returns defined", () => {
    const c = extractRaltCandidate("K_HYPHEN", "0272", "kb-hyphen-test");
    expect(c).toBeDefined();
    expect(c?.vkey).toBe("K_HYPHEN");
    expect(c?.modifiers).toContain("RALT");
  });
});

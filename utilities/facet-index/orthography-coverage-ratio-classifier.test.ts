/**
 * Orthography-coverage-ratio classifier unit tests (spec 043 US2; FR-023; AS #4,
 * Edge Cases).
 *
 * Fixtures use the real codec + a minimal `.kps` declaring a BCP47 tag. A
 * base-layer identity rule engages the spec-040 fall-through fold so the base's
 * a–z surface counts as produced. Coverage is |exemplar ∩ produced| / |exemplar|
 * against the pinned CLDR snapshot; a tag with no exemplar set → `not-derivable`
 * (distinct from a 0.0 ratio).
 */

import { describe, it, expect } from "vitest";

import { parse } from "../../packages/engine/src/codec/index.js";
import {
  classifyOrthographyCoverageRatio,
  orthographyCoverageRatioFallback,
  NOT_DERIVABLE,
} from "./orthography-coverage-ratio-classifier.js";
import type { FacetDefinition } from "./types.js";
import type { ScannedKeyboard, ScannedSource } from "./scan.js";

const DEF: FacetDefinition = {
  id: "orthography-coverage-ratio",
  title: "Orthography coverage ratio",
  description: "Fraction of the target orthography's exemplar letters the base produces.",
  valueType: "scalar",
  limits: { domain: [0, 1] },
  likelihoodSemantics: "ratio of covered CLDR exemplar characters; not-derivable when no exemplar set",
  derivation: { archetype: "character-content", classifierId: "orthography-coverage-ratio-classifier", fallbackChain: ["content-derived", "undetermined"] },
  feedsSessionFacets: [],
  schemaVersion: 1,
};

const HEADER = `store(&VERSION) '10.0'
store(&NAME) 'Test'
store(&TARGETS) 'any'

begin Unicode > use(main)

group(main) using keys
`;

const KPS_PATH = "release/t/test/source/test.kps";

function kbWithTag(tag: string | null): ScannedKeyboard {
  const langBlock = tag === null ? "" : `<Languages><Language ID="${tag}">L</Language></Languages>`;
  const xml = `<?xml version="1.0"?><Package><Keyboards><Keyboard><ID>test</ID>${langBlock}</Keyboard></Keyboards></Package>`;
  const sources: ScannedSource[] = [{ path: KPS_PATH, bytes: Buffer.from(xml, "utf8") }];
  return { id: "test", kpsPath: KPS_PATH, kmnPath: null, kmnText: null, sources };
}

/** A Latin base: one base-layer identity rule engages the a–z fall-through fold. */
const LATIN_KMN = `${HEADER}\n+ [K_Q] > 'q'\n`;

describe("classifyOrthographyCoverageRatio", () => {
  it("full a–z base covers the English exemplar set → ratio 1.0", () => {
    const { ir } = parse(LATIN_KMN, "en");
    const result = classifyOrthographyCoverageRatio(ir, DEF, kbWithTag("en"))!;
    expect(result.value).toBe(1);
    expect(result.provenanceTier).toBe("content-derived");
    expect(result.evidenceSize).toBe(26);
  });

  it("a–z base misses French accented letters → ratio < 1 with missing set noted", () => {
    const { ir } = parse(LATIN_KMN, "fr");
    const result = classifyOrthographyCoverageRatio(ir, DEF, kbWithTag("fr"))!;
    expect(typeof result.value).toBe("number");
    expect(result.value as number).toBeGreaterThan(0);
    expect(result.value as number).toBeLessThan(1);
    expect(result.notes).toMatch(/missing:/);
  });

  it("region-qualified tag resolves to the language exemplar set (fr-FR → fr)", () => {
    const { ir } = parse(LATIN_KMN, "fr-region");
    const result = classifyOrthographyCoverageRatio(ir, DEF, kbWithTag("fr-FR"))!;
    expect(typeof result.value).toBe("number");
  });

  it("no exemplar set for the declared tag → not-derivable (≠ 0.0)", () => {
    const { ir } = parse(LATIN_KMN, "sw");
    const result = classifyOrthographyCoverageRatio(ir, DEF, kbWithTag("sw"))!;
    expect(result.value).toBe(NOT_DERIVABLE);
    expect(result.confidenceClass).toBe("undetermined");
  });

  it("no declared tag at all → not-derivable", () => {
    const { ir } = parse(LATIN_KMN, "notag");
    const result = classifyOrthographyCoverageRatio(ir, DEF, kbWithTag(null))!;
    expect(result.value).toBe(NOT_DERIVABLE);
  });

  it("no produced characters → null (fall through)", () => {
    const { ir } = parse(HEADER, "empty");
    expect(classifyOrthographyCoverageRatio(ir, DEF, kbWithTag("en"))).toBeNull();
  });
});

describe("orthographyCoverageRatioFallback", () => {
  it("returns an honest undetermined fallback-only record", () => {
    const result = orthographyCoverageRatioFallback({ id: "broken" } as unknown as ScannedKeyboard, DEF);
    expect(result.analysisOutcome).toBe("fallback-only");
    expect(result.provenanceTier).not.toBe("content-derived");
    expect(result.value).toBeUndefined();
  });
});

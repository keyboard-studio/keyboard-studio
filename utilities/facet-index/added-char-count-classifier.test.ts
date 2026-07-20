/**
 * Added-char-count classifier unit tests (spec 043 US1; FR-011; AS #2).
 *
 * Fixtures are built with the real codec. The count is `|producedFull \ stock
 * kbdus set|`, banded to spec-§7 axis A1. Rules that add accented letters (plus
 * one base-layer identity rule so the spec-040 fall-through fold engages) leave
 * the added set equal to just the accented characters.
 */

import { describe, it, expect } from "vitest";

import { parse } from "../../packages/engine/src/codec/index.js";
import { classifyAddedCharCount, addedCharCountFallback, a1Band } from "./added-char-count-classifier.js";
import type { FacetDefinition } from "./types.js";
import type { ScannedKeyboard } from "./scan.js";

const DEF: FacetDefinition = {
  id: "added-char-count",
  title: "Added character count",
  description: "Characters produced beyond a stock physical layout, banded to axis A1.",
  valueType: "enum",
  limits: { values: ["tiny", "small", "medium", "large", "massive"], open: false },
  likelihoodSemantics: "axis-A1 band of the added-char count; raw count in evidenceSize",
  derivation: { archetype: "character-content", classifierId: "added-char-count-classifier", fallbackChain: ["content-derived", "undetermined"] },
  feedsSessionFacets: ["lineage.added-char-count"],
  schemaVersion: 1,
};

const HEADER = `store(&VERSION) '10.0'
store(&NAME) 'Test'
store(&TARGETS) 'any'

begin Unicode > use(main)

group(main) using keys
`;

describe("a1Band", () => {
  it("bands per spec §7 axis A1 with contiguous boundaries", () => {
    expect(a1Band(0)).toBe("tiny");
    expect(a1Band(4)).toBe("tiny");
    expect(a1Band(5)).toBe("small");
    expect(a1Band(19)).toBe("small");
    expect(a1Band(20)).toBe("medium");
    expect(a1Band(99)).toBe("medium");
    expect(a1Band(100)).toBe("large");
    expect(a1Band(299)).toBe("large");
    expect(a1Band(300)).toBe("massive");
    expect(a1Band(5000)).toBe("massive");
  });
});

describe("classifyAddedCharCount", () => {
  it("a handful of accented letters over kbdus -> tiny band, count in evidenceSize", () => {
    // One base-layer identity rule (K_Q -> q) so the fall-through fold engages,
    // plus three shifted accented outputs. The a-z leak cancels against the stock
    // kbdus set, leaving exactly the three accented characters as 'added'.
    const kmn = `${HEADER}\n+ [K_Q] > 'q'\n+ [SHIFT K_1] > U+00E9\n+ [SHIFT K_2] > U+00E8\n+ [SHIFT K_3] > U+00E0\n`;
    const { ir } = parse(kmn, "test-accents");
    const result = classifyAddedCharCount(ir, DEF)!;
    expect(result.value).toBe("tiny");
    expect(result.evidenceSize).toBe(3);
    expect(result.provenanceTier).toBe("content-derived");
    expect(result.notes).toMatch(/3 character/);
  });

  it("adds enough accented letters to reach the small band", () => {
    const rules = ["é", "è", "à", "ù", "ê", "î"] // 6 accented -> small
      .map((ch, i) => `+ [SHIFT K_${i + 1}] > U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`)
      .join("\n");
    const kmn = `${HEADER}\n+ [K_Q] > 'q'\n${rules}\n`;
    const { ir } = parse(kmn, "test-small");
    const result = classifyAddedCharCount(ir, DEF)!;
    expect(result.evidenceSize).toBe(6);
    expect(result.value).toBe("small");
  });

  it("no produced characters -> null (fall through to fallback)", () => {
    const { ir } = parse(HEADER, "test-empty");
    expect(classifyAddedCharCount(ir, DEF)).toBeNull();
  });
});

describe("addedCharCountFallback", () => {
  it("returns an honest undetermined fallback-only record", () => {
    const result = addedCharCountFallback({ id: "broken" } as unknown as ScannedKeyboard, DEF);
    expect(result.analysisOutcome).toBe("fallback-only");
    expect(result.provenanceTier).not.toBe("content-derived");
    expect(result.value).toBeUndefined();
  });
});

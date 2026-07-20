/**
 * Combining-mark-repertoire classifier unit tests (spec 043 US2; FR-021; AS #2).
 *
 * Fixtures use the real codec. An alphabetic (Latin) base records its inputtable
 * combining-mark set; an abugida (Devanagari) / abjad (Arabic) base records
 * `not-applicable` (the script-family guard), never a forced empty set.
 */

import { describe, it, expect } from "vitest";

import { parse } from "../../packages/engine/src/codec/index.js";
import {
  classifyCombiningMarkRepertoire,
  combiningMarkRepertoireFallback,
} from "./combining-mark-repertoire-classifier.js";
import type { FacetDefinition } from "./types.js";
import type { ScannedKeyboard } from "./scan.js";

const DEF: FacetDefinition = {
  id: "combining-mark-repertoire",
  title: "Combining-mark repertoire",
  description: "Inputtable combining marks; not-applicable off alphabetic scripts.",
  valueType: "set",
  limits: { values: ["not-applicable"], open: true },
  likelihoodSemantics: "the set of inputtable combining marks; not-applicable for non-alphabetic scripts",
  derivation: { archetype: "character-content", classifierId: "combining-mark-repertoire-classifier", fallbackChain: ["content-derived", "undetermined"] },
  feedsSessionFacets: [],
  schemaVersion: 1,
};

const HEADER = `store(&VERSION) '10.0'
store(&NAME) 'Test'
store(&TARGETS) 'any'

begin Unicode > use(main)

group(main) using keys
`;

describe("classifyCombiningMarkRepertoire", () => {
  it("alphabetic (Latin) base → the sorted combining-mark set", () => {
    const kmn = `${HEADER}\n+ [K_A] > 'a'\n+ [K_1] > U+0301\n+ [K_2] > U+0300\n`;
    const { ir } = parse(kmn, "latin-marks");
    const result = classifyCombiningMarkRepertoire(ir, DEF)!;
    expect(Array.isArray(result.value)).toBe(true);
    expect(result.value).toEqual(["̀", "́"]); // sorted combining grave, acute
    expect(result.provenanceTier).toBe("content-derived");
    expect(result.notApplicable).toBeUndefined();
  });

  it("alphabetic base with no combining marks → applicable, empty set", () => {
    const kmn = `${HEADER}\n+ [K_A] > 'a'\n+ [K_B] > 'b'\n`;
    const { ir } = parse(kmn, "latin-plain");
    const result = classifyCombiningMarkRepertoire(ir, DEF)!;
    expect(result.value).toEqual([]);
    expect(result.notApplicable).toBeUndefined();
  });

  it("abugida (Devanagari) base → not-applicable", () => {
    const kmn = `${HEADER}\n+ [K_A] > U+0915\n+ [K_B] > U+0916\n`;
    const { ir } = parse(kmn, "deva");
    const result = classifyCombiningMarkRepertoire(ir, DEF)!;
    expect(result.notApplicable).toBe(true);
    expect(result.value).toBeUndefined();
    expect(result.provenanceTier).toBe("content-derived");
  });

  it("abjad (Arabic) base → not-applicable", () => {
    const kmn = `${HEADER}\n+ [K_A] > U+0628\n+ [K_B] > U+062A\n`;
    const { ir } = parse(kmn, "arab");
    const result = classifyCombiningMarkRepertoire(ir, DEF)!;
    expect(result.notApplicable).toBe(true);
  });

  it("no concretely-scripted output → null (fall through)", () => {
    const { ir } = parse(HEADER, "empty");
    expect(classifyCombiningMarkRepertoire(ir, DEF)).toBeNull();
  });
});

describe("combiningMarkRepertoireFallback", () => {
  it("returns an honest undetermined fallback-only record", () => {
    const result = combiningMarkRepertoireFallback({ id: "broken" } as unknown as ScannedKeyboard, DEF);
    expect(result.analysisOutcome).toBe("fallback-only");
    expect(result.provenanceTier).not.toBe("content-derived");
  });
});

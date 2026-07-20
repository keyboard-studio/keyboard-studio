/**
 * Script-family classifier unit tests (spec 043 US3; FR-032; AS #3). ISO-15924
 * dominant script → family via the pinned lookup; the exported `deriveScriptFamily`
 * is the durable guard combining-mark-repertoire consumes (T061).
 */

import { describe, it, expect } from "vitest";

import { parse } from "../../packages/engine/src/codec/index.js";
import { classifyScriptFamily, deriveScriptFamily, scriptFamilyFallback } from "./script-family-classifier.js";
import type { FacetDefinition } from "./types.js";
import type { ScannedKeyboard } from "./scan.js";

const DEF: FacetDefinition = {
  id: "script-family",
  title: "Script family",
  description: "Writing-system family of the dominant script.",
  valueType: "enum",
  limits: { values: ["alphabet", "abugida", "abjad", "syllabary", "logographic"], open: false },
  likelihoodSemantics: "family of the dominant ISO-15924 script",
  derivation: { archetype: "character-content", classifierId: "script-family-classifier", fallbackChain: ["content-derived", "undetermined"] },
  feedsSessionFacets: [],
  schemaVersion: 1,
};

const HEADER = `store(&VERSION) '10.0'
store(&NAME) 'Test'
store(&TARGETS) 'any'

begin Unicode > use(main)

group(main) using keys
`;

describe("classifyScriptFamily", () => {
  it("Latin → alphabet", () => {
    const { ir } = parse(`${HEADER}\n+ [K_A] > 'a'\n`, "latn");
    expect(classifyScriptFamily(ir, DEF)!.value).toBe("alphabet");
  });

  it("Devanagari → abugida", () => {
    const { ir } = parse(`${HEADER}\n+ [K_A] > U+0915\n+ [K_B] > U+0916\n`, "deva");
    expect(classifyScriptFamily(ir, DEF)!.value).toBe("abugida");
  });

  it("Arabic → abjad", () => {
    const { ir } = parse(`${HEADER}\n+ [K_A] > U+0628\n+ [K_B] > U+062A\n`, "arab");
    expect(classifyScriptFamily(ir, DEF)!.value).toBe("abjad");
  });

  it("no dominant script → null (fall through)", () => {
    const { ir } = parse(`${HEADER}\n+ [K_1] > '1'\n`, "neutral");
    expect(classifyScriptFamily(ir, DEF)).toBeNull();
  });
});

describe("deriveScriptFamily (the combining-mark-repertoire guard)", () => {
  it("alphabet for Latin, abugida for Devanagari — the guard combining-mark-repertoire keys on", () => {
    const latn = parse(`${HEADER}\n+ [K_A] > 'a'\n`, "g-latn").ir;
    const deva = parse(`${HEADER}\n+ [K_A] > U+0915\n`, "g-deva").ir;
    expect(deriveScriptFamily(latn, DEF)).toBe("alphabet");
    expect(deriveScriptFamily(deva, DEF)).toBe("abugida");
  });
});

describe("scriptFamilyFallback", () => {
  it("returns an honest undetermined fallback-only record", () => {
    const result = scriptFamilyFallback({ id: "x" } as unknown as ScannedKeyboard, DEF);
    expect(result.analysisOutcome).toBe("fallback-only");
    expect(result.provenanceTier).not.toBe("content-derived");
  });
});

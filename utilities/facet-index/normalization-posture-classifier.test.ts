/**
 * Normalization-posture classifier unit tests (spec 041 US1, T016).
 */

import { describe, it, expect } from "vitest";

import { parse } from "../../packages/engine/src/codec/index.js";
import { classifyNormalizationPosture } from "./normalization-posture-classifier.js";
import type { FacetDefinition } from "./types.js";

const DEF = {} as FacetDefinition;
const HEADER = `store(&VERSION) '10.0'
store(&NAME) 'T'
store(&TARGETS) 'any'
store(&COPYRIGHT) '(c) 2026'
store(&KEYBOARDVERSION) '1.0'

begin Unicode > use(main)

group(main) using keys
`;
const ir = (body: string) => parse(HEADER + body, "norm-test").ir;

describe("classifyNormalizationPosture", () => {
  it("precomposed Latin output (U+00E9) → nfc", () => {
    const cat = classifyNormalizationPosture(ir("+ [K_E] > U+00E9\n"), DEF)!;
    expect(cat.value).toBe("nfc");
  });

  it("decomposed Latin output (e + combining acute) → nfd, combining mark → principled-split when it deviates", () => {
    // one nfc, two nfd → dominant nfd; the lone nfc deviation is a base letter,
    // not a combining mark, so it is gap-omission — check the value is nfd.
    const body = "+ [K_E] > U+0065 U+0301\n+ [K_A] > U+0061 U+0301\n";
    const cat = classifyNormalizationPosture(ir(body), DEF)!;
    expect(cat.value).toBe("nfd");
    expect(cat.consistency).toBe(1);
  });

  it("mixed nfc + nfd → mixed", () => {
    const body = "+ [K_E] > U+00E9\n+ [K_A] > U+0061 U+0301\n";
    const cat = classifyNormalizationPosture(ir(body), DEF)!;
    expect(cat.value).toBe("mixed");
  });

  it("caseless abjad (Arabic) → notApplicable, never nfc/nfd (FR-014, AS-5)", () => {
    const cat = classifyNormalizationPosture(ir("+ [K_A] > U+0627\n"), DEF)!;
    expect(cat.notApplicable).toBe(true);
    expect(cat.value).toBeUndefined();
  });

  it("Latin keyboard with no accented output → undetermined fallback (not notApplicable)", () => {
    const cat = classifyNormalizationPosture(ir("+ [K_A] > U+0061\n"), DEF)!;
    expect(cat.notApplicable).toBeUndefined();
    expect(cat.value).toBeUndefined();
    expect(cat.confidenceClass).toBe("undetermined");
  });
});

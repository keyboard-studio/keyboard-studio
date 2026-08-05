/**
 * Casing classifier unit tests (spec 041 US1, T010). Real IRs via the codec.
 */

import { describe, it, expect } from "vitest";

import { parse } from "../../packages/engine/src/codec/index.js";
import { classifyCasing, casingFallback } from "./casing-classifier.js";
import type { FacetDefinition } from "./types.js";
import type { ScannedKeyboard } from "./scan.js";

const DEF = {} as FacetDefinition;
const HEADER = `store(&VERSION) '10.0'
store(&NAME) 'T'
store(&TARGETS) 'any'
store(&COPYRIGHT) '(c) 2026'
store(&KEYBOARDVERSION) '1.0'

begin Unicode > use(main)

group(main) using keys
`;
const ir = (body: string) => parse(HEADER + body, "casing-test").ir;

describe("classifyCasing", () => {
  it("Latin output → cased", () => {
    const cat = classifyCasing(ir("+ [K_A] > U+0061\n"), DEF)!;
    expect(cat.value).toBe("cased");
    expect(cat.provenanceTier).toBe("content-derived");
    expect(cat.consistency).toBe(1);
  });

  it("Arabic output → caseless", () => {
    expect(classifyCasing(ir("+ [K_A] > U+0627\n"), DEF)!.value).toBe("caseless");
  });

  it("Latin + Arabic output → mixed", () => {
    expect(classifyCasing(ir("+ [K_A] > U+0061\n+ [K_S] > U+0627\n"), DEF)!.value).toBe("mixed");
  });

  it("no produced characters → null (fall through to fallback)", () => {
    expect(classifyCasing(ir(""), DEF)).toBeNull();
  });

  it("fallback is undetermined, non-content tier", () => {
    const cat = casingFallback({} as ScannedKeyboard, DEF);
    expect(cat.value).toBeUndefined();
    expect(cat.confidenceClass).toBe("undetermined");
    expect(cat.provenanceTier).not.toBe("content-derived");
  });
});

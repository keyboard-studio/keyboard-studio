/**
 * Casing facet derivation unit tests (spec 048 FR-008). Real IRs via the
 * codec — the same fixtures as utilities/facet-index/casing-classifier.test.ts,
 * whose casing-classification behavior now delegates to this function (via
 * measurement.ts's deriveScriptContext) rather than reimplementing it.
 */

import { describe, it, expect } from "vitest";

import { parse } from "../codec/index.js";
import { deriveCasingFacet } from "./casing.js";

const HEADER = `store(&VERSION) '10.0'
store(&NAME) 'T'
store(&TARGETS) 'any'
store(&COPYRIGHT) '(c) 2026'
store(&KEYBOARDVERSION) '1.0'

begin Unicode > use(main)

group(main) using keys
`;
const ir = (body: string) => parse(HEADER + body, "casing-test").ir;

describe("deriveCasingFacet", () => {
  it("Latin output -> cased", () => {
    expect(deriveCasingFacet(ir("+ [K_A] > U+0061\n"))).toBe("cased");
  });

  it("Arabic output -> caseless", () => {
    expect(deriveCasingFacet(ir("+ [K_A] > U+0627\n"))).toBe("caseless");
  });

  it("Latin + Arabic output -> mixed", () => {
    expect(deriveCasingFacet(ir("+ [K_A] > U+0061\n+ [K_S] > U+0627\n"))).toBe("mixed");
  });

  it("no produced characters -> caseless (the producesCasedLetter fallback)", () => {
    // Unlike the offline `casing` classifier (which gates on "no produced
    // characters" BEFORE calling this and reports `undetermined` instead),
    // this primitive always returns a concrete value — see facets/accessors.ts
    // `deriveFacets` for where the runtime facet applies that same gate.
    expect(deriveCasingFacet(ir(""))).toBe("caseless");
  });
});

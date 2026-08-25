/**
 * Facet accessor unit tests (spec 048 US1-US3, FR-003/004/005/006).
 */

import { describe, it, expect } from "vitest";

import { parse } from "../codec/index.js";
import { CASING_FACET_ID, deriveFacets, getEffectiveFacet, setFacetOverride, clearFacetOverride } from "./accessors.js";

const HEADER = `store(&VERSION) '10.0'
store(&NAME) 'T'
store(&TARGETS) 'any'
store(&COPYRIGHT) '(c) 2026'
store(&KEYBOARDVERSION) '1.0'

begin Unicode > use(main)

group(main) using keys
`;
const ir = (body: string) => parse(HEADER + body, "facets-test").ir;

describe("deriveFacets", () => {
  it("bakes a derived casing facet onto the IR (US1)", () => {
    const withFacets = deriveFacets(ir("+ [K_A] > U+0061\n"));
    expect(withFacets.facets?.[CASING_FACET_ID]).toEqual({ value: "cased", provenance: "derived" });
  });

  it("records undetermined (never a silently absent facet) when the base produces no characters (Edge Case, SC-004)", () => {
    const withFacets = deriveFacets(ir(""));
    expect(withFacets.facets?.[CASING_FACET_ID]).toEqual({ provenance: "undetermined" });
  });

  it("does not mutate the input IR", () => {
    const original = ir("+ [K_A] > U+0061\n");
    deriveFacets(original);
    expect(original.facets).toBeUndefined();
  });
});

describe("getEffectiveFacet", () => {
  it("reads the derived value when there is no override (US1)", () => {
    const withFacets = deriveFacets(ir("+ [K_A] > U+0061\n"));
    expect(getEffectiveFacet(withFacets, CASING_FACET_ID)).toEqual({
      value: "cased",
      provenance: "derived",
    });
  });

  it("reads undetermined for a facet id with no derived entry and no override", () => {
    const withFacets = deriveFacets(ir("+ [K_A] > U+0061\n"));
    expect(getEffectiveFacet(withFacets, "some-other-facet")).toEqual({ provenance: "undetermined" });
  });
});

describe("setFacetOverride / clearFacetOverride", () => {
  it("an override takes precedence over the derived value (US2)", () => {
    const derived = deriveFacets(ir("+ [K_A] > U+0627\n")); // Arabic -> caseless
    expect(getEffectiveFacet(derived, CASING_FACET_ID).value).toBe("caseless");

    const overridden = setFacetOverride(derived, CASING_FACET_ID, "cased");
    expect(getEffectiveFacet(overridden, CASING_FACET_ID)).toEqual({
      value: "cased",
      provenance: "overridden",
    });
  });

  it("clearing an override restores the derived value (US2, FR-006)", () => {
    const derived = deriveFacets(ir("+ [K_A] > U+0627\n"));
    const overridden = setFacetOverride(derived, CASING_FACET_ID, "cased");
    const cleared = clearFacetOverride(overridden, CASING_FACET_ID);
    expect(getEffectiveFacet(cleared, CASING_FACET_ID)).toEqual({
      value: "caseless",
      provenance: "derived",
    });
  });

  it("an override can set a value for an undetermined facet, and reads back as overridden (US3)", () => {
    const derived = deriveFacets(ir("")); // no produced chars -> undetermined
    expect(getEffectiveFacet(derived, CASING_FACET_ID).provenance).toBe("undetermined");

    const overridden = setFacetOverride(derived, CASING_FACET_ID, "cased");
    expect(getEffectiveFacet(overridden, CASING_FACET_ID)).toEqual({
      value: "cased",
      provenance: "overridden",
    });
  });

  it("never mutates its input IR (setFacetOverride)", () => {
    const derived = deriveFacets(ir("+ [K_A] > U+0061\n"));
    setFacetOverride(derived, CASING_FACET_ID, "caseless");
    expect(derived.facetOverrides).toBeUndefined();
  });

  it("does not modify the base keyboard's derived facets (FR-010)", () => {
    const derived = deriveFacets(ir("+ [K_A] > U+0061\n"));
    setFacetOverride(derived, CASING_FACET_ID, "caseless");
    expect(derived.facets?.[CASING_FACET_ID]).toEqual({ value: "cased", provenance: "derived" });
  });
});

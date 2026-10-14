// Sanity tests for the spec 084 Batch 3 check-data tables
// (iso639_5.ts, cldrCurrency.ts). These pin the provenance rules, not
// the whole datasets: the ISO list must contain collective codes and
// no individual-language codes; the currency table must resolve the
// territories the checks are exercised against and follow the stated
// generation rule (first current tender currency, narrow symbol
// preferred).

import { describe, expect, it } from "vitest";

import { CLDR_TERRITORY_CURRENCY } from "./cldrCurrency.ts";
import { ISO_639_5_COLLECTIVE_CODES } from "./iso639_5.ts";

describe("ISO_639_5_COLLECTIVE_CODES", () => {
  it("holds the LoC table's 114 collective codes, all 3 lowercase letters", () => {
    expect(ISO_639_5_COLLECTIVE_CODES.size).toBe(114);
    for (const code of ISO_639_5_COLLECTIVE_CODES) {
      expect(code).toMatch(/^[a-z]{3}$/);
    }
  });

  it("contains known collective codes (families and remainder groups)", () => {
    for (const code of ["afa", "alg", "bnt", "cmc", "ine", "sla", "znd"]) {
      expect(ISO_639_5_COLLECTIVE_CODES.has(code)).toBe(true);
    }
  });

  it("contains no individual-language codes", () => {
    // fra/deu/ewo are ISO 639-3 individual languages, never collectives.
    for (const code of ["fra", "deu", "ewo", "eng", "cmn"]) {
      expect(ISO_639_5_COLLECTIVE_CODES.has(code)).toBe(false);
    }
  });
});

describe("CLDR_TERRITORY_CURRENCY", () => {
  it("resolves Cameroon to the Central African CFA franc and its symbol", () => {
    expect(CLDR_TERRITORY_CURRENCY["CM"]).toEqual({
      currency: "XAF",
      symbol: "FCFA",
    });
  });

  it("prefers the narrow symbol where CLDR gives a distinct one (Ghana)", () => {
    expect(CLDR_TERRITORY_CURRENCY["GH"]).toEqual({
      currency: "GHS",
      symbol: "GH₵",
    });
    expect(CLDR_TERRITORY_CURRENCY["NG"]).toEqual({
      currency: "NGN",
      symbol: "₦",
    });
  });

  it("covers the common single-currency territories", () => {
    expect(CLDR_TERRITORY_CURRENCY["US"]?.symbol).toBe("$");
    expect(CLDR_TERRITORY_CURRENCY["DE"]?.symbol).toBe("€");
    expect(CLDR_TERRITORY_CURRENCY["IN"]?.symbol).toBe("₹");
  });

  it("keys are uppercase alpha-2 territories with non-empty symbols", () => {
    const keys = Object.keys(CLDR_TERRITORY_CURRENCY);
    expect(keys.length).toBeGreaterThan(200);
    for (const key of keys) {
      expect(key).toMatch(/^[A-Z]{2}$/);
      expect(CLDR_TERRITORY_CURRENCY[key]!.symbol.length).toBeGreaterThan(0);
      expect(CLDR_TERRITORY_CURRENCY[key]!.currency).toMatch(/^[A-Z]{3}$/);
    }
  });
});

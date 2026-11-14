// variants.test — spec 115 T044 (US2, Wave 1).
//
// The IANA variant registry, prefix-aware: a variant is allowed after a tag
// only when one of its recorded prefixes is present in the tag (data-model.md
// § VariantEntry — the FR-021 prefix rule).

import { describe, expect, it } from "vitest";
import { variantAllowed, variantEntry, variantsFor } from "./variants.js";

describe("variantEntry", () => {
  it("returns the registry row for a known variant", () => {
    expect(variantEntry("gascon")).toEqual({
      subtag: "gascon",
      descriptions: ["Gascon"],
      prefixes: ["oc"],
      deprecated: false,
    });
  });

  it("matches case-insensitively", () => {
    expect(variantEntry("GASCON")?.subtag).toBe("gascon");
  });

  it("returns undefined for an unregistered subtag", () => {
    expect(variantEntry("notavariant")).toBeUndefined();
  });

  it("carries the multi-prefix row for 1994", () => {
    expect(variantEntry("1994")?.prefixes).toEqual([
      "sl-rozaj",
      "sl-rozaj-biske",
      "sl-rozaj-njiva",
      "sl-rozaj-osojs",
      "sl-rozaj-solba",
    ]);
  });
});

describe("variantAllowed", () => {
  it("allows gascon after oc and not after en", () => {
    expect(variantAllowed("oc", "gascon")).toBe(true);
    expect(variantAllowed("oc-Latn-FR", "gascon")).toBe(true);
    expect(variantAllowed("en", "gascon")).toBe(false);
  });

  it("allows 1994 only after sl-rozaj and its extensions", () => {
    expect(variantAllowed("sl-rozaj", "1994")).toBe(true);
    expect(variantAllowed("sl-rozaj-biske", "1994")).toBe(true);
    expect(variantAllowed("sl", "1994")).toBe(false);
    expect(variantAllowed("sl-rozaj-njiva", "1994")).toBe(true);
  });

  it("allows biske only after sl-rozaj", () => {
    expect(variantAllowed("sl-rozaj", "biske")).toBe(true);
    expect(variantAllowed("sl", "biske")).toBe(false);
    expect(variantAllowed("en", "biske")).toBe(false);
  });

  it("requires the prefix's script and region when the prefix names them", () => {
    // abl1943 is registered for pt-BR only.
    expect(variantAllowed("pt-BR", "abl1943")).toBe(true);
    expect(variantAllowed("pt-PT", "abl1943")).toBe(false);
    expect(variantAllowed("pt", "abl1943")).toBe(false);
  });

  it("allows a prefix-less variant anywhere", () => {
    // alalc97 carries no prefixes.
    expect(variantAllowed("en", "alalc97")).toBe(true);
    expect(variantAllowed("oc", "alalc97")).toBe(true);
  });

  it("rejects an unknown variant and a variant already in the tag", () => {
    expect(variantAllowed("oc", "notavariant")).toBe(false);
    expect(variantAllowed("oc-gascon", "gascon")).toBe(false);
  });
});

describe("variantsFor", () => {
  it("lists the registered variants allowed after a language", () => {
    const subtags = variantsFor("oc").map((v) => v.subtag);
    expect(subtags).toContain("gascon");
    expect(subtags).toContain("aranes");
    expect(subtags).not.toContain("valencia");
  });

  it("lists French variants after fr, including the 1694acad orthography", () => {
    const subtags = variantsFor("fr").map((v) => v.subtag);
    expect(subtags).toContain("1694acad");
    expect(subtags).toContain("gallo");
    expect(subtags).not.toContain("gascon");
  });

  it("grows with the tag: sl-rozaj gains 1994 and biske over sl", () => {
    expect(variantsFor("sl").map((v) => v.subtag)).not.toContain("1994");
    const rozaj = variantsFor("sl-rozaj").map((v) => v.subtag);
    expect(rozaj).toContain("1994");
    expect(rozaj).toContain("biske");
  });

  it("returns only the prefix-less variants for an unknown language", () => {
    // A variant with no prefixes is allowed anywhere (data-model.md § VariantEntry),
    // so even an unknown language offers the seven prefix-less ones — and nothing else.
    expect(variantsFor("zzz").map((v) => v.subtag)).toEqual([
      "alalc97",
      "fonipa",
      "fonkirsh",
      "fonnapa",
      "fonupa",
      "fonxsamp",
      "simple",
    ]);
  });

  it("excludes deprecated variants: hy offers neither arevela nor arevmda", () => {
    const subtags = variantsFor("hy").map((v) => v.subtag);
    expect(subtags).not.toContain("arevela");
    expect(subtags).not.toContain("arevmda");
  });
});

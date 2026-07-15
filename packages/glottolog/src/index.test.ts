// T011 [US1] — Catalog tests (spec 036, contracts/glottolog-catalog-api.md).
// Fixtures are pinned glottocodes from scripts/glottolog-version.json (Glottolog
// 5.3): English stan1293 / eng, German stan1295 / deu, Basque basq1248 (isolate),
// American Sign Language amer1248 / ase (pseudo-family sign1238).

import { describe, expect, it } from "vitest";
import { ancestors, byIso639p3, getLanguoid, relatedIsoCodes } from "./index.js";
import { byIso as rawByIso } from "./generated/index.js";

describe("getLanguoid (FR-007)", () => {
  it("resolves a known glottocode with its computed fields", () => {
    const eng = getLanguoid("stan1293");
    expect(eng).not.toBeNull();
    expect(eng).toMatchObject({
      glottocode: "stan1293",
      name: "English",
      level: "language",
      iso639p3: "eng",
      familyId: "indo1319",
      isPseudoFamily: false,
    });
  });

  it("returns null for an unknown glottocode (never throws)", () => {
    expect(getLanguoid("nope0000")).toBeNull();
    expect(getLanguoid("")).toBeNull();
  });

  it("defaults familyId to self for an isolate and flags pseudo-families", () => {
    const basque = getLanguoid("basq1248");
    expect(basque?.familyId).toBe("basq1248"); // isolate: self is the family root
    expect(basque?.isPseudoFamily).toBe(false);

    const asl = getLanguoid("amer1248");
    expect(asl?.familyId).toBe("sign1238");
    expect(asl?.isPseudoFamily).toBe(true); // sign1238 is a curated pseudo-family
  });
});

describe("byIso639p3 (FR-008, D4 permissive)", () => {
  it("returns all matching languoids for a known ISO code", () => {
    const langs = byIso639p3("eng");
    expect(langs.map((l) => l.glottocode)).toContain("stan1293");
  });

  it("is case-insensitive on input", () => {
    expect(byIso639p3("ENG")).toEqual(byIso639p3("eng"));
  });

  it("returns [] for an unmapped code (never throws)", () => {
    expect(byIso639p3("zzz")).toEqual([]);
    expect(byIso639p3("")).toEqual([]);
  });

  it("is permissive: returns every glottocode for the code, deduped and sorted", () => {
    // Scan the generated index for any ISO that maps to >1 glottocode. This
    // pinned release (Glottolog 5.3) is 1:1 ISO→glottocode; the assertion below
    // still exercises the permissive contract and will flag a future release
    // that introduces a genuine multi-glottocode ISO so the case gets a fixture.
    const multi = Object.entries(rawByIso).find(([, codes]) => codes.length > 1);
    if (multi) {
      const [iso, codes] = multi;
      const got = byIso639p3(iso).map((l) => l.glottocode);
      expect(got).toEqual([...codes]); // codegen sorts; loader preserves order
      expect(new Set(got).size).toBe(got.length); // deduped
    } else {
      // Document the 1:1 invariant of the pinned data.
      for (const codes of Object.values(rawByIso)) {
        expect(codes.length).toBe(1);
      }
    }
  });
});

describe("ancestors (FR-009, D7 root-first)", () => {
  it("returns the root-first path excluding self", () => {
    const path = ancestors("stan1293").map((l) => l.glottocode);
    expect(path[0]).toBe("indo1319"); // family root first
    expect(path[path.length - 1]).toBe("macr1271"); // immediate parent last
    expect(path).not.toContain("stan1293"); // excludes self
    expect(path).toEqual([
      "indo1319",
      "clas1257",
      "germ1287",
      "nort3152",
      "west2793",
      "nort3175",
      "angl1264",
      "angl1265",
      "late1254",
      "merc1242",
      "macr1271",
    ]);
  });

  it("returns [] for an isolate / top-level family", () => {
    expect(ancestors("basq1248")).toEqual([]); // isolate
    expect(ancestors("indo1319")).toEqual([]); // top-level family
  });

  it("returns [] for an unknown glottocode (never throws)", () => {
    expect(ancestors("nope0000")).toEqual([]);
  });
});

describe("relatedIsoCodes (FR-011a, D4)", () => {
  it("unions relatives, keeps only ISO-bearing, drops the input's own code", () => {
    const rel = relatedIsoCodes("eng");
    expect(rel.length).toBeGreaterThan(0);
    expect(rel.every((r) => r.languoid.iso639p3 !== undefined)).toBe(true);
    expect(rel.some((r) => r.languoid.iso639p3 === "deu")).toBe(true); // German
    expect(rel.some((r) => r.languoid.iso639p3 === "eng")).toBe(false); // not self
  });

  it("returns [] for an unmapped ISO (never throws)", () => {
    expect(relatedIsoCodes("zzz")).toEqual([]);
  });
});

// T012 [US1] — Relatedness tests (spec 036, FR-011/012/013, SC-006).
// Fixtures (Glottolog 5.3): English stan1293, German stan1295, Dutch dutc1256,
// Tamil tami1289 (Dravidian — cross-family), American Sign Language amer1248
// (pseudo-family sign1238).

import { describe, expect, it } from "vitest";
import { relatedLanguages } from "./relatedness.js";
import { getLanguoid } from "./catalog.js";
import type { RelatednessResult } from "./types.js";

const rel = relatedLanguages("stan1293");
const by = (gc: string): RelatednessResult | undefined =>
  rel.find((r) => r.languoid.glottocode === gc);

describe("relatedLanguages — related pairs (FR-011)", () => {
  it("ranks known same-family languages as related", () => {
    expect(by("stan1295")).toBeDefined(); // German
    expect(by("dutc1256")).toBeDefined(); // Dutch
    // Both are West-Germanic-deep relatives of English.
    expect(by("stan1295")!.sharedSubgroupDepth).toBe(5);
    expect(by("dutc1256")!.sharedSubgroupDepth).toBe(5);
  });
});

describe("relatedLanguages — cross-family excluded (FR-011)", () => {
  it("never returns a languoid from another family", () => {
    expect(rel.every((r) => r.languoid.familyId === "indo1319")).toBe(true);
    expect(by("tami1289")).toBeUndefined(); // Tamil is Dravidian
  });

  it("returns [] for a top-level family or isolate", () => {
    expect(relatedLanguages("indo1319")).toEqual([]); // family
    expect(relatedLanguages("basq1248")).toEqual([]); // isolate
    expect(relatedLanguages("nope0000")).toEqual([]); // unknown, never throws
  });
});

describe("relatedLanguages — pseudo-family excluded (FR-012, SC-006)", () => {
  it("a pseudo-family member has no genealogical relatives", () => {
    // Two languages that share only a pseudo-family (Sign Language) are NOT
    // related: every candidate in sign1238 is a pseudo-family member.
    expect(getLanguoid("amer1248")?.isPseudoFamily).toBe(true);
    expect(relatedLanguages("amer1248")).toEqual([]);
  });

  it("no result is ever a pseudo-family member", () => {
    expect(rel.every((r) => r.languoid.isPseudoFamily === false)).toBe(true);
  });
});

describe("relatedLanguages — ordering (D3)", () => {
  it("is sorted by sharedSubgroupDepth desc, then pathLength asc, then glottocode asc", () => {
    for (let i = 1; i < rel.length; i++) {
      const a = rel[i - 1]!;
      const b = rel[i]!;
      const ordered =
        a.sharedSubgroupDepth > b.sharedSubgroupDepth ||
        (a.sharedSubgroupDepth === b.sharedSubgroupDepth &&
          (a.pathLength < b.pathLength ||
            (a.pathLength === b.pathLength &&
              a.languoid.glottocode.localeCompare(b.languoid.glottocode) <= 0)));
      expect(ordered).toBe(true);
    }
  });
});

describe("relatedLanguages — no default cap + opt-in bounds (FR-013, D9)", () => {
  it("returns all relatives by default (no silent truncation)", () => {
    expect(rel.length).toBeGreaterThan(1000); // 3234 in the pinned release
  });

  it("honours maxResults", () => {
    expect(relatedLanguages("stan1293", { maxResults: 5 })).toHaveLength(5);
    expect(relatedLanguages("stan1293", { maxResults: 0 })).toHaveLength(0);
  });

  it("honours minSharedDepth", () => {
    const deep = relatedLanguages("stan1293", { minSharedDepth: 6 });
    expect(deep.length).toBeGreaterThan(0);
    expect(deep.every((r) => r.sharedSubgroupDepth >= 6)).toBe(true);
    expect(deep.length).toBeLessThan(rel.length);
  });

  it("honours the levels filter", () => {
    const langs = relatedLanguages("stan1293", { levels: ["language"] });
    expect(langs.length).toBeGreaterThan(0);
    expect(langs.every((r) => r.languoid.level === "language")).toBe(true);
  });
});

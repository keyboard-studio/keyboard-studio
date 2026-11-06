import { describe, expect, it } from "vitest";

import type { SourcedInventory } from "./services.ts";
import {
  distinctLanguageTags,
  loadExemplarUnion,
  neededLettersByLanguage,
  unionExemplars,
} from "./openExpectedInventory.ts";

function inv(chars: Array<[string, "main" | "auxiliary" | "punctuation" | "numbers"]>): SourcedInventory {
  return {
    resolvedTag: "x",
    source: "cldr",
    confidence: "approved",
    characters: chars.map(([char, tier]) => ({ char, tier, source: "cldr", confidence: "approved" })),
    digraphs: [],
  } as SourcedInventory;
}

describe("unionExemplars", () => {
  const index = new Map<string, SourcedInventory | null>([
    ["fr", inv([["e", "main"], ["é", "main"], ["œ", "auxiliary"]])],
    ["bkm", inv([["e", "main"], ["ɔ", "main"], [".", "punctuation"], ["1", "numbers"]])],
    ["zzz", null],
  ]);

  it("unions standard characters across languages without duplicates", () => {
    const u = unionExemplars(["fr", "bkm"], index);
    expect([...u.chars].sort()).toEqual(["1", ".", "e", "é", "ɔ"].sort());
    expect(u.withData).toBe(2);
    expect(u.total).toBe(2);
  });

  it("excludes the auxiliary tier", () => {
    expect(unionExemplars(["fr"], index).chars).not.toContain("œ");
  });

  it("counts tags with no data and never guesses for them", () => {
    const u = unionExemplars(["fr", "zzz", "unknown"], index);
    expect(u.withData).toBe(1);
    expect(u.total).toBe(3);
    expect(u.withoutData).toEqual(["zzz", "unknown"]);
  });

  it("normalises to NFC", () => {
    const u = unionExemplars(["d"], new Map([["d", inv([["é", "main"]])]]));
    expect(u.chars).toEqual(["é"]);
  });

  it("dedupes and trims tags, drops blanks", () => {
    expect(distinctLanguageTags([" fr ", "fr", "", "  "])).toEqual(["fr"]);
  });
});

describe("loadExemplarUnion", () => {
  it("looks every tag up, treating a throw as no data", async () => {
    const { union, sourcedByTag } = await loadExemplarUnion(["a", "b"], async (tag) => {
      if (tag === "b") throw new Error("boom");
      return inv([["a", "main"]]);
    });
    expect(union.withData).toBe(1);
    expect(union.withoutData).toEqual(["b"]);
    expect(sourcedByTag.get("b")).toBeNull();
  });
});

describe("neededLettersByLanguage", () => {
  const index = new Map<string, SourcedInventory | null>([
    ["fr", inv([["e", "main"], ["é", "main"], ["œ", "auxiliary"], [".", "punctuation"]])],
    ["fr-CA", inv([["é", "main"]])],
    ["bkm", inv([["e", "main"], ["ɔ", "main"], ["1", "numbers"]])],
    ["zzz", null],
  ]);

  it("maps each character to every listed language whose main set has it", () => {
    const m = neededLettersByLanguage(["fr", "fr-CA", "bkm", "zzz"], index);
    expect(m.get("é")).toEqual(["fr", "fr-CA"]);
    expect(m.get("e")).toEqual(["fr", "bkm"]);
    expect(m.get("ɔ")).toEqual(["bkm"]);
  });

  it("uses the main tier only", () => {
    const m = neededLettersByLanguage(["fr", "bkm"], index);
    expect(m.has("œ")).toBe(false);
    expect(m.has(".")).toBe(false);
    expect(m.has("1")).toBe(false);
  });

  it("normalises exemplar characters to NFC", () => {
    const m = neededLettersByLanguage(["d"], new Map([["d", inv([["é", "main"]])]]));
    expect(m.get("é")).toEqual(["d"]);
  });

  it("gives no entry for a tag with no data and ignores duplicate tags", () => {
    const m = neededLettersByLanguage(["zzz", "fr", "fr"], index);
    expect(m.get("e")).toEqual(["fr"]);
  });
});

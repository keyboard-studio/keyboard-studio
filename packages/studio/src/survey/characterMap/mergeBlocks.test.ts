import { describe, it, expect } from "vitest";
import { mergeBlocksAcrossTiers } from "./mergeBlocks.ts";
import type { CharacterMapGroup } from "../../lib/services.ts";

function group(
  block: string,
  tier: CharacterMapGroup["tier"],
  script: string,
  chars: string[],
  usedByBase = false,
): CharacterMapGroup {
  return {
    block,
    tier,
    script,
    usedByBase,
    cells: chars.map((char) => ({ char, isCombiningMark: false })),
  };
}

const charsOf = (g: CharacterMapGroup): string[] => g.cells.map((c) => c.char);

describe("mergeBlocksAcrossTiers", () => {
  it("merges a block's exemplar tier into its full enumeration, cells in codepoint order", () => {
    // The shipped shape of the bug: buildCharacterMap emits "Latin Extended-B
    // — main" (the exemplars, already selected) well before the full
    // "Latin Extended-B", so the author's own alphabet appears in a duplicate
    // stub section above the real block instead of highlighted inside it.
    const merged = mergeBlocksAcrossTiers([
      group("Latin Extended-B", "main", "Latn", ["ǎ", "ǐ"]),
      group("Latin Extended-B", "block", "Latn", ["ƀ", "Ǐ", "ɏ"]),
    ]);
    expect(merged).toHaveLength(1);
    expect(charsOf(merged[0]!)).toEqual(["ƀ", "ǎ", "Ǐ", "ǐ", "ɏ"]);
  });

  it("merges across the script tag when the block name is a real Unicode block", () => {
    // ASCII digits reach the map tagged "Common" while the Latin letters
    // beside them are tagged "Latn" — both are "Basic Latin" and belong in one
    // section (the screenshot showed "Basic Latin — loanwords" then a second
    // bare "Basic Latin" holding 0-9).
    const merged = mergeBlocksAcrossTiers([
      group("Basic Latin", "auxiliary", "Latn", ["c", "j"]),
      group("Basic Latin", "digits", "Common", ["0", "1"]),
    ]);
    expect(merged).toHaveLength(1);
    expect(charsOf(merged[0]!)).toEqual(["0", "1", "c", "j"]);
  });

  it("keeps generic per-tier labels separate per script", () => {
    // "Digits" is a fallback label, not a Unicode block — it only means
    // "Tibetan digits" because of its script tag, so merging across scripts
    // would pile unrelated scripts under one meaningless heading.
    const merged = mergeBlocksAcrossTiers([
      group("Digits", "digits", "Tibt", ["༠"]),
      group("Digits", "digits", "Nkoo", ["߀"]),
    ]);
    expect(merged).toHaveLength(2);
    expect(merged.map((g) => g.script)).toEqual(["Tibt", "Nkoo"]);
  });

  it("drops the tier label when a merged section is no longer one tier", () => {
    const merged = mergeBlocksAcrossTiers([
      group("Basic Latin", "main", "Latn", ["a"]),
      group("Basic Latin", "digits", "Common", ["0"]),
    ]);
    expect(merged[0]!.tier).toBe("block");
  });

  it("keeps the tier of a section that only ever had one", () => {
    const merged = mergeBlocksAcrossTiers([group("Digits", "digits", "Tibt", ["༠"])]);
    expect(merged[0]!.tier).toBe("digits");
  });

  it("ORs usedByBase across the merged parts", () => {
    const merged = mergeBlocksAcrossTiers([
      group("Latin Extended-B", "main", "Latn", ["ǎ"], false),
      group("Latin Extended-B", "block", "Latn", ["ƀ"], true),
    ]);
    expect(merged[0]!.usedByBase).toBe(true);
  });

  it("orders blocks ascending within a script, scripts in engine-emitted order", () => {
    // Both halves matter: the exemplar-bearing block must not float to the top
    // just because its `main` group came first out of the engine.
    const merged = mergeBlocksAcrossTiers([
      group("Latin Extended-B", "main", "Latn", ["ǎ"]),
      group("Cyrillic", "main", "Cyrl", ["а"]),
      group("Basic Latin", "block", "Latn", ["a"]),
      group("Latin-1 Supplement", "block", "Latn", ["á"]),
    ]);
    expect(merged.map((g) => g.block)).toEqual([
      "Basic Latin",
      "Latin-1 Supplement",
      "Latin Extended-B",
      "Cyrillic",
    ]);
  });
});

// see spec.md sections 8 step 4, 16 — type-coverage + stub-implementation tests
// for the Phase B character-discovery contract (multi-method: manual /
// text-sample / linguist / picker). Shape-only under strict tsconfig, matching
// types.test.ts. The structured LinguistInventory itself is covered in
// linguistInventory.test.ts.

import { describe, it, expect } from "vitest";
import type {
  InventoryChar,
  DiscoveryMethod,
  CharacterDiscoveryService,
} from "./characterDiscovery";
import { makeLinguistInventory } from "./linguistInventory";
import { basicKbdus } from "./fixtures/baseKeyboards";

describe("InventoryChar shape", () => {
  it("frequency-bearing entry carries count + method", () => {
    const c: InventoryChar = {
      char: "é",
      count: 42,
      inBaseOutput: false,
      method: "text-sample",
    };
    expect(c.count).toBe(42);
    expect(c.method).toBe("text-sample");
  });

  it("picker/manual entry may omit count (no corpus)", () => {
    const c: InventoryChar = { char: "ŋ", inBaseOutput: false, method: "picker" };
    expect("count" in c).toBe(false);
    expect(c.method).toBe("picker");
  });

  it("accepts every DiscoveryMethod literal", () => {
    const methods: DiscoveryMethod[] = [
      "manual",
      "text-sample",
      "linguist",
      "picker",
    ];
    methods.forEach((m) => {
      const c: InventoryChar = { char: "x", inBaseOutput: true, method: m };
      expect(c.method).toBe(m);
    });
  });
});

describe("CharacterDiscoveryService contract", () => {
  // A stub exercising the three methods — enough to prove the contract is
  // implementable; the real service does grapheme segmentation, the linguist
  // agent synthesis + CLDR cross-check, and a CLDR-exemplar lookup.
  const stub: CharacterDiscoveryService = {
    async harvestFromText(sample, _base) {
      const counts = new Map<string, number>();
      for (const ch of sample) {
        if (ch.trim() === "") continue;
        counts.set(ch, (counts.get(ch) ?? 0) + 1);
      }
      return [...counts.entries()].map(([char, count]) => ({
        char,
        count,
        inBaseOutput: false,
        method: "text-sample" as const,
      }));
    },
    async synthesizeInventory(languageName, bcp47) {
      return makeLinguistInventory({
        language: bcp47,
        script: "Latin",
        alphabetCore: { lowercase: ["a", "ɛ"], uppercase: ["A", "Ɛ"] },
        mandatoryDiacriticsAndLigatures: [],
        languageSpecificPunctuation: [],
        numerals: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
        flags: [{ char: "ɛ", issue: "cldr-omitted" }],
        sources: [{ title: `${languageName} alphabet`, kind: "orthography" }],
      });
    },
    async pickerCandidates(_base, _bcp47) {
      // No count for picker candidates.
      return [{ char: "ŋ", inBaseOutput: false, method: "picker" }];
    },
  };

  it("harvestFromText ranks distinct graphemes and tags the method", async () => {
    const out = await stub.harvestFromText("aab ", basicKbdus);
    expect(out).toEqual([
      { char: "a", count: 2, inBaseOutput: false, method: "text-sample" },
      { char: "b", count: 1, inBaseOutput: false, method: "text-sample" },
    ]);
  });

  it("harvestFromText on empty sample yields an empty inventory", async () => {
    expect(await stub.harvestFromText("", basicKbdus)).toEqual([]);
  });

  it("synthesizeInventory returns a structured, cross-checked LinguistInventory", async () => {
    const inv = await stub.synthesizeInventory("Bambara", "bm");
    expect(inv.language).toBe("bm");
    expect(inv.alphabetCore.uppercase).toContain("Ɛ");
    expect(inv.flags?.[0]?.issue).toBe("cldr-omitted");
    expect(inv.sources?.[0]?.kind).toBe("orthography");
  });

  it("pickerCandidates omits count and tags method 'picker'", async () => {
    const cands = await stub.pickerCandidates(basicKbdus, "bm");
    expect(cands[0]?.method).toBe("picker");
    expect("count" in (cands[0] ?? {})).toBe(false);
  });
});

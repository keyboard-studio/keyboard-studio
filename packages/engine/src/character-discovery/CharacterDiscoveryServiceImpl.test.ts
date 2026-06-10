import { describe, it, expect } from "vitest";
import { createCharacterDiscoveryService } from "./CharacterDiscoveryServiceImpl.js";
import type { BaseKeyboard } from "@keyboard-studio/contracts";

// A null loader is safe here — harvestFromText never calls the CLDR loader
const nullLoader = async (_locale: string): Promise<string | null> => null;
const service = createCharacterDiscoveryService(nullLoader);

// Happy-path loader: returns French exemplars for "fr", null for everything else
const frLoader = async (locale: string): Promise<string | null> =>
  locale === "fr" ? "[a b é ñ]" : null;
const frService = createCharacterDiscoveryService(frLoader);
const nullService = createCharacterDiscoveryService(nullLoader);

// Minimal BaseKeyboard fixture (harvestFromText uses only the ASCII proxy, not
// any field from base, so the exact values here do not matter)
const baseKb: BaseKeyboard = {
  id: "basic_kbdus",
  path: "release/b/basic_kbdus",
  script: "Latn",
  targets: ["windows"],
  displayName: "US English",
  version: "1.0",
};

describe("CharacterDiscoveryServiceImpl.pickerCandidates", () => {
  const latnBase: BaseKeyboard = {
    id: "basic_kbdus",
    path: "release/b/basic_kbdus",
    script: "Latn",
    targets: ["windows"],
    displayName: "US English",
    version: "1.0",
  };

  const unknownBase: BaseKeyboard = {
    id: "unknown_kb",
    path: "release/u/unknown_kb",
    script: "Zzzz",
    targets: ["windows"],
    displayName: "Unknown Script",
    version: "1.0",
  };

  it("bcp47 provided + CLDR returns exemplars → non-ASCII chars present, method=picker, no count", async () => {
    const result = await frService.pickerCandidates(latnBase, "fr");
    // é (U+00E9) and ñ (U+00F1) should appear
    const chars = result.map((r) => r.char);
    expect(chars).toContain("é");
    expect(chars).toContain("ñ");
    for (const item of result) {
      expect(item.method).toBe("picker");
      expect("count" in item).toBe(false);
    }
  });

  it("bcp47 provided but CLDR loader returns null → falls back to script block; non-empty for Latn", async () => {
    const result = await nullService.pickerCandidates(latnBase, "fr");
    expect(result.length).toBeGreaterThan(0);
    for (const item of result) {
      expect(item.method).toBe("picker");
    }
  });

  it("bcp47 absent → uses script block chars; non-empty for Latn", async () => {
    const result = await nullService.pickerCandidates(latnBase);
    expect(result.length).toBeGreaterThan(0);
    for (const item of result) {
      expect(item.method).toBe("picker");
    }
  });

  it("ASCII chars have inBaseOutput: true; non-ASCII chars have inBaseOutput: false", async () => {
    const result = await frService.pickerCandidates(latnBase, "fr");
    for (const item of result) {
      const cp = item.char.codePointAt(0) ?? 0;
      if (cp <= 0x7e) {
        expect(item.inBaseOutput).toBe(true);
      } else {
        expect(item.inBaseOutput).toBe(false);
      }
    }
  });

  it("result is sorted ascending by codepoint", async () => {
    const result = await nullService.pickerCandidates(latnBase);
    for (let i = 1; i < result.length; i++) {
      const prev = result[i - 1]!.char.codePointAt(0) ?? 0;
      const curr = result[i]!.char.codePointAt(0) ?? 0;
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
  });

  it("unknown script + null CLDR loader → returns []", async () => {
    const result = await nullService.pickerCandidates(unknownBase);
    expect(result).toEqual([]);
  });

  it("bcp47 provided but CLDR null + unknown script → returns []", async () => {
    const result = await nullService.pickerCandidates(unknownBase, "zzzz");
    expect(result).toEqual([]);
  });
});

describe("CharacterDiscoveryServiceImpl.harvestFromText", () => {
  it("returns [] for empty string", async () => {
    const result = await service.harvestFromText("", baseKb);
    expect(result).toEqual([]);
  });

  it("returns [] for whitespace-only string", async () => {
    const result = await service.harvestFromText("   \t\n", baseKb);
    expect(result).toEqual([]);
  });

  it("single char returns one entry with count 1", async () => {
    const result = await service.harvestFromText("a", baseKb);
    expect(result).toHaveLength(1);
    expect(result[0]?.char).toBe("a");
    expect(result[0]?.count).toBe(1);
  });

  it("frequency sorting: aab → a(2) then b(1)", async () => {
    const result = await service.harvestFromText("aab", baseKb);
    expect(result).toHaveLength(2);
    expect(result[0]?.char).toBe("a");
    expect(result[0]?.count).toBe(2);
    expect(result[1]?.char).toBe("b");
    expect(result[1]?.count).toBe(1);
  });

  it("tie broken by ascending codepoint", async () => {
    const result = await service.harvestFromText("ba", baseKb);
    expect(result).toHaveLength(2);
    expect(result[0]?.char).toBe("a");
    expect(result[1]?.char).toBe("b");
  });

  it("combining sequence 'é' (e + U+0301) is ONE entry", async () => {
    // é is e followed by combining acute accent — one grapheme cluster
    const combining = "é";
    const result = await service.harvestFromText(combining, baseKb);
    expect(result).toHaveLength(1);
    expect(result[0]?.char).toBe(combining);
  });

  it("ASCII chars have inBaseOutput: true", async () => {
    const result = await service.harvestFromText("abc", baseKb);
    for (const item of result) {
      expect(item.inBaseOutput).toBe(true);
    }
  });

  it("non-ASCII char é (precomposed U+00E9) has inBaseOutput: false", async () => {
    const result = await service.harvestFromText("é", baseKb);
    expect(result).toHaveLength(1);
    expect(result[0]?.inBaseOutput).toBe(false);
  });

  it("method is 'text-sample' on every entry", async () => {
    const result = await service.harvestFromText("hello", baseKb);
    for (const item of result) {
      expect(item.method).toBe("text-sample");
    }
  });

  it("count is always present (never undefined) on text-sample results", async () => {
    const result = await service.harvestFromText("hello world", baseKb);
    for (const item of result) {
      expect(item.count).toBeDefined();
      expect(typeof item.count).toBe("number");
    }
  });
});

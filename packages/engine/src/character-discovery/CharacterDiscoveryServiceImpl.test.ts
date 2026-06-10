import { describe, it, expect } from "vitest";
import { createCharacterDiscoveryService } from "./CharacterDiscoveryServiceImpl.js";
import type { BaseKeyboard } from "@keyboard-studio/contracts";

// A null loader is safe here — harvestFromText never calls the CLDR loader
const nullLoader = async (_locale: string): Promise<string | null> => null;
const service = createCharacterDiscoveryService(nullLoader);

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
    // 'b' (U+0062) and 'a' (U+0061) both appear once; 'a' should come first
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

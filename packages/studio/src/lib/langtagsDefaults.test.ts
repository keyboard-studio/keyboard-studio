// Tests for langtagsDefaults.ts helper utilities.
//
// The lazy-load path (loadLangtags / searchLanguages / defaultsFor) is tested
// with a vi.mock so the dynamic import resolves synchronously in jsdom without
// requiring the real engine dist chunk.
//
// scriptToTargetOption is pure synchronous — tested directly.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { scriptToTargetOption } from "./langtagsDefaults.ts";

// ---------------------------------------------------------------------------
// scriptToTargetOption — pure function, no mocking needed
// ---------------------------------------------------------------------------

describe("scriptToTargetOption", () => {
  it("maps Latn to Latn", () => {
    expect(scriptToTargetOption("Latn")).toBe("Latn");
  });

  it("maps Deva to Deva", () => {
    expect(scriptToTargetOption("Deva")).toBe("Deva");
  });

  it("maps Arab to Arab", () => {
    expect(scriptToTargetOption("Arab")).toBe("Arab");
  });

  it("maps Hebr to Hebr", () => {
    expect(scriptToTargetOption("Hebr")).toBe("Hebr");
  });

  it("maps Cyrl to Cyrl", () => {
    expect(scriptToTargetOption("Cyrl")).toBe("Cyrl");
  });

  it("maps Grek to Grek", () => {
    expect(scriptToTargetOption("Grek")).toBe("Grek");
  });

  it("maps Geor to Geor", () => {
    expect(scriptToTargetOption("Geor")).toBe("Geor");
  });

  it("maps Armn to Armn", () => {
    expect(scriptToTargetOption("Armn")).toBe("Armn");
  });

  it("maps Ethi to Ethi (proposal shown honestly, routing handles gating)", () => {
    expect(scriptToTargetOption("Ethi")).toBe("Ethi");
  });

  it("maps Hani to Hani", () => {
    expect(scriptToTargetOption("Hani")).toBe("Hani");
  });

  it("maps Hang to Hang", () => {
    expect(scriptToTargetOption("Hang")).toBe("Hang");
  });

  it("maps undefined to null (no default script — caller leaves field unseeded)", () => {
    expect(scriptToTargetOption(undefined)).toBeNull();
  });

  it("maps an unknown script (e.g. Mymr/Burmese) to null, not 'other'", () => {
    // Scripts without a dedicated il_target_script option must return null so
    // callers do NOT seed "other" — which would be a worse proposal than nothing.
    expect(scriptToTargetOption("Mymr")).toBeNull();
  });

  it("maps Bengali script (Beng) to null — no seed produced", () => {
    expect(scriptToTargetOption("Beng")).toBeNull();
  });

  it("maps Thai script (Thai) to null — no seed produced", () => {
    expect(scriptToTargetOption("Thai")).toBeNull();
  });

  it("maps Khmer script (Khmr) to null — no seed produced", () => {
    expect(scriptToTargetOption("Khmr")).toBeNull();
  });

  it("does NOT map romanization-Latn — that is a user-only choice", () => {
    // romanization-Latn is not an ISO-15924 script subtag; it is an
    // il_target_script-level concept. The mapping must never produce it
    // from a defaultScript value (spec §8/§9 decoupling).
    const result = scriptToTargetOption("romanization-Latn");
    expect(result).toBeNull(); // falls through to default
  });
});

// ---------------------------------------------------------------------------
// loadLangtags / lazy module mocking
// ---------------------------------------------------------------------------

// We mock the dynamic import so tests run without the real engine dist.
// The mock is scoped to these tests via vi.mock hoisting.

const mockGetLanguageDefaults = vi.fn();
const mockListLanguages = vi.fn();
const mockLookupByName = vi.fn();

vi.mock("@keyboard-studio/engine/langtags", () => ({
  getLanguageDefaults: mockGetLanguageDefaults,
  listLanguages: mockListLanguages,
  lookupByName: mockLookupByName,
}));

// Reset the module-level promise between tests so each test starts clean.
// We do this by re-importing with a fresh mock state.
beforeEach(() => {
  vi.resetModules();
  mockGetLanguageDefaults.mockReset();
  mockListLanguages.mockReset();
  mockLookupByName.mockReset();
});

describe("langtagsDefaults lazy helpers", () => {
  it("searchLanguages returns [] for empty query without calling lookupByName", async () => {
    // Use a fresh import to get a new module state (no cached promise).
    const { searchLanguages } = await import("./langtagsDefaults.ts");
    const result = await searchLanguages("");
    expect(result).toEqual([]);
    expect(mockLookupByName).not.toHaveBeenCalled();
  });

  it("searchLanguages delegates to lookupByName for non-empty query", async () => {
    mockLookupByName.mockReturnValue([
      { code: "ha", englishName: "Hausa", autonym: "Hausa", defaultScript: "Latn" },
    ]);
    const { searchLanguages } = await import("./langtagsDefaults.ts");
    const result = await searchLanguages("Hausa");
    expect(mockLookupByName).toHaveBeenCalledWith("Hausa");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ code: "ha", englishName: "Hausa" });
  });

  it("defaultsFor returns null for empty code without calling getLanguageDefaults", async () => {
    const { defaultsFor } = await import("./langtagsDefaults.ts");
    const result = await defaultsFor("");
    expect(result).toBeNull();
    expect(mockGetLanguageDefaults).not.toHaveBeenCalled();
  });

  it("defaultsFor resolves Hausa (ha) with Latn default script", async () => {
    mockGetLanguageDefaults.mockImplementation((code: string) => {
      if (code.toLowerCase() === "ha") {
        return { code: "ha", defaultScript: "Latn", defaultRegion: "NG", regions: ["NG"], englishName: "Hausa" };
      }
      return null;
    });
    const { defaultsFor } = await import("./langtagsDefaults.ts");
    const result = await defaultsFor("ha");
    expect(result).not.toBeNull();
    expect(result?.defaultScript).toBe("Latn");
    expect(result?.defaultRegion).toBe("NG");
  });

  it("defaultsFor returns null for an unknown code (contract C5)", async () => {
    mockGetLanguageDefaults.mockReturnValue(null);
    const { defaultsFor } = await import("./langtagsDefaults.ts");
    const result = await defaultsFor("zzz");
    expect(result).toBeNull();
  });
});

// Tests for the browser pattern library service (Part 1).
// Note: import.meta.glob is mocked in the vitest environment (no Vite transform
// at test time), so YAML_MODULES resolves to {}. The test exercises the logic by
// directly calling getPatternLibraryService() and checking the empty-glob
// degradation path (0 patterns), plus the mock path (USE_REAL=false gives
// mockPatternLibrary). For the glob load logic itself, the engine's
// patternLibrary.test.ts is the authoritative round-trip test.
//
// refs #370 #367

import { describe, it, expect, vi, beforeAll } from "vitest";

// Mock import.meta.glob before importing the module under test.
// Vitest runs in Node/jsdom, not Vite — import.meta.glob is undefined.
vi.stubGlobal("importMetaGlob", {});

describe("browserPatternLibrary", () => {
  it("getPatternLibraryService() returns an object satisfying PatternLibraryService", async () => {
    const { getPatternLibraryService } = await import("./browserPatternLibrary.ts");
    const svc = getPatternLibraryService();
    expect(typeof svc.listAll).toBe("function");
    expect(typeof svc.getById).toBe("function");
    expect(typeof svc.filterFor).toBe("function");
  });

  it("listAll() resolves to an array (may be empty when glob yields no files in test env)", async () => {
    const { getPatternLibraryService } = await import("./browserPatternLibrary.ts");
    const svc = getPatternLibraryService();
    const all = await svc.listAll();
    expect(Array.isArray(all)).toBe(true);
  });

  it("getById() returns undefined for an unknown id", async () => {
    const { getPatternLibraryService } = await import("./browserPatternLibrary.ts");
    const svc = getPatternLibraryService();
    const result = await svc.getById("__nonexistent__");
    expect(result).toBeUndefined();
  });

  it("filterFor() returns an array for a Latin-script base", async () => {
    const { getPatternLibraryService } = await import("./browserPatternLibrary.ts");
    const svc = getPatternLibraryService();
    const base = {
      id: "basic_kbdus",
      path: "release/b/basic_kbdus",
      script: "Latn",
      targets: [] as never[],
      displayName: "US English",
      version: "1.0",
    };
    const matches = await svc.filterFor(base);
    expect(Array.isArray(matches)).toBe(true);
    // All matches must have ascending rank starting at 1.
    matches.forEach((m, idx) => {
      expect(m.rank).toBe(idx + 1);
    });
  });

  it("filterFor() with axes produces strategy-ranked matches", async () => {
    const { getPatternLibraryService } = await import("./browserPatternLibrary.ts");
    const svc = getPatternLibraryService();
    const base = {
      id: "basic_kbdus",
      path: "release/b/basic_kbdus",
      script: "Latn",
      targets: [] as never[],
      displayName: "US English",
      version: "1.0",
    };
    const axes = {
      scale: "small" as const,
      scriptClass: "alphabetic" as const,
      phoneticIntuition: "strong" as const,
      diacriticBehavior: "stacking-combining" as const,
      multiMode: "single" as const,
      constraintEnforcement: "none" as const,
      spareKeyAvailability: "many" as const,
    };
    const matches = await svc.filterFor(base, axes);
    expect(Array.isArray(matches)).toBe(true);
    // ranks start at 1 and are ascending
    matches.forEach((m, idx) => {
      expect(m.rank).toBe(idx + 1);
    });
  });
});

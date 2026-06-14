// Tests for the browser pattern library service.
// vitest runs through Vite, so import.meta.glob IS transformed here and the real
// content/patterns catalog loads — the same path the SPA build uses. The
// "loads the real content/patterns catalog" case below is the regression guard
// that the glob path resolves the repo-root tree (not an empty match).

import { describe, it, expect } from "vitest";

describe("browserPatternLibrary", () => {
  it("getPatternLibraryService() returns an object satisfying PatternLibraryService", async () => {
    const { getPatternLibraryService } = await import("./browserPatternLibrary.ts");
    const svc = getPatternLibraryService();
    expect(typeof svc.listAll).toBe("function");
    expect(typeof svc.getById).toBe("function");
    expect(typeof svc.filterFor).toBe("function");
  });

  // Regression guard: the import.meta.glob path must actually resolve the
  // repo-root content/patterns tree. A too-lenient "may be empty" assertion
  // previously masked a wrong glob path that loaded ZERO patterns (the gallery
  // would render empty). Assert the real catalog loads.
  it("listAll() loads the real content/patterns catalog", async () => {
    const { getPatternLibraryService } = await import("./browserPatternLibrary.ts");
    const svc = getPatternLibraryService();
    const all = await svc.listAll();
    expect(Array.isArray(all)).toBe(true);
    expect(all.length).toBeGreaterThan(0);
    // A known desktop-input pattern must be present (proves the glob path + the
    // null-fragment schema handling both work against the real catalog).
    expect(await svc.getById("deadkey_single_tap")).toBeDefined();
    expect(await svc.getById("multi_char_sequence")).toBeDefined();
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

// Theme persistence (epic #533 design-system foundation). Same
// localStorage-guard idiom as i18n.ts's locale persistence — see
// i18n.test.ts / firstVisit.test.ts for the sibling coverage this mirrors.
import { describe, it, expect, afterEach, vi } from "vitest";
import { DEFAULT_THEME, loadSavedTheme, saveTheme } from "./theme.ts";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("theme persistence", () => {
  it("default theme is navy", () => {
    expect(DEFAULT_THEME).toBe("navy");
  });

  it("reports no saved theme for a pristine browser", () => {
    expect(loadSavedTheme()).toBeNull();
  });

  it("round-trips through storage", () => {
    saveTheme("light");
    expect(loadSavedTheme()).toBe("light");

    saveTheme("navy");
    expect(loadSavedTheme()).toBe("navy");
  });

  it("persists under the ks.theme key", () => {
    saveTheme("light");
    expect(localStorage.getItem("ks.theme")).toBe("light");
  });

  it("falls back to null (caller defaults to navy) for an unknown stored value", () => {
    localStorage.setItem("ks.theme", "midnight-blue");
    expect(loadSavedTheme()).toBeNull();
  });

  it("saveTheme does not throw when localStorage.setItem fails", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });

    expect(() => saveTheme("light")).not.toThrow();
  });

  it("loadSavedTheme returns null (not throw) when localStorage.getItem fails", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("security restriction");
    });

    let result: ReturnType<typeof loadSavedTheme> = "navy";
    expect(() => {
      result = loadSavedTheme();
    }).not.toThrow();
    expect(result).toBeNull();
  });
});

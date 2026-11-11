// Generated CLDR index + picker entries (issue #2599, criterion 1).

import { describe, it, expect } from "vitest";
import {
  CLDR_INDEX,
  cldrStartKeyboards,
  groupCldrIndex,
} from "./index.js";

describe("CLDR_INDEX (generated, pinned to release-43-1)", () => {
  it("pins the tag commit", () => {
    expect(CLDR_INDEX.source.repo).toBe("unicode-org/cldr");
    expect(CLDR_INDEX.source.tag).toBe("release-43-1");
    expect(CLDR_INDEX.source.commit).toMatch(/^[0-9a-f]{40}$/);
  });

  it("covers all four platforms", () => {
    const platforms = new Set(CLDR_INDEX.entries.map((e) => e.platform));
    expect(platforms).toEqual(
      new Set(["android", "windows", "osx", "chromeos"]),
    );
    expect(CLDR_INDEX.entries.length).toBeGreaterThan(500);
  });

  it("has no duplicate (locale, platform, variant, dpi) file", () => {
    const keys = CLDR_INDEX.entries.map(
      (e) => `${e.locale}|${e.platform}|${e.variant}|${e.dpi ?? ""}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("lists German on windows and android", () => {
    const de = CLDR_INDEX.entries.filter((e) => e.locale === "de");
    expect(de.some((e) => e.platform === "windows" && e.file === "de-t-k0-windows.xml")).toBe(true);
    expect(de.some((e) => e.platform === "android" && e.file === "de-t-k0-android.xml")).toBe(true);
    expect(de.find((e) => e.platform === "windows")?.name).toBe("German");
    expect(de.find((e) => e.platform === "windows")?.script).toBe("Latn");
  });
});

describe("cldrStartKeyboards", () => {
  const starts = cldrStartKeyboards();

  it("builds one picker entry per (locale, variant) group", () => {
    expect(starts).toHaveLength(groupCldrIndex().length);
    expect(starts.length).toBeGreaterThan(200);
    const ids = starts.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("combines the German desktop + android files into one start", () => {
    const de = starts.find((s) => s.id === "cldr_de");
    expect(de).toBeDefined();
    expect(de?.origin).toBe("cldr");
    expect(de?.displayName).toBe("German (CLDR Windows)");
    expect(de?.cldr?.desktopFile).toBe("de-t-k0-windows.xml");
    expect(de?.cldr?.desktopPlatform).toBe("windows");
    expect(de?.cldr?.androidFile).toBe("de-t-k0-android.xml");
    expect(de?.cldr?.tabletFile).toBe("de-t-k0-android-600dpi.xml");
    expect(de?.targets).toContain("mobile");
    expect(de?.targets).toContain("windows");
    expect(de?.languages).toEqual(["de"]);
  });

  it("keeps Android-only locales as starts with no desktop file", () => {
    const af = starts.find((s) => s.id === "cldr_af");
    expect(af).toBeDefined();
    expect(af?.cldr?.desktopFile).toBeUndefined();
    expect(af?.cldr?.androidFile).toBe("af-t-k0-android.xml");
  });

  it("prefers windows over osx/chromeos for the desktop half", () => {
    // de has all three desktop platforms; windows wins.
    const de = starts.find((s) => s.id === "cldr_de");
    expect(de?.cldr?.desktopPlatform).toBe("windows");
  });
});
